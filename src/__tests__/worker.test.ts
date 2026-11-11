import {
  processMailchimpWebhookEvent,
  processGristStagedEvent,
  handleDeadLetterJob,
  acquireContactLock,
  releaseContactLock,
} from '../queue/worker';
import * as tenantConfigModule from '../config/tenantConfig';
import * as gristService from '../services/grist.service';
import * as mailchimpService from '../services/mailchimp.service';
import { redisClient } from '../queue/connection';
import { TenantConfig } from '../types/sync.types';

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../queue/connection', () => ({
  redisConnectionOptions: {},
  redisClient: {
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue('OK'),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue('mock-token-xyz'),
    del: jest.fn().mockResolvedValue(1),
    on: jest.fn(),
  },
}));

jest.mock('../services/grist.service', () => ({
  writeToGrist: jest.fn().mockResolvedValue({ success: true }),
  writeSyncLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/mailchimp.service', () => ({
  upsertMailchimpMember: jest.fn().mockResolvedValue({
    id: 'assigned-mc-id-999',
    email_address: 'alex@example.com',
    status: 'subscribed',
  }),
}));

describe('Worker Event Processing', () => {
  const mockTenant: TenantConfig = {
    tenantId: 'client-test',
    grist: {
      docId: 'doc123',
      tableId: 'Contacts',
      apiUrl: 'https://grist.example.com',
      apiKey: 'secret',
    },
    mailchimp: {
      listId: 'list1',
      apiKey: 'mc-key',
      serverPrefix: 'us20',
    },
    fieldMapping: {
      external_first_name: 'First_Name',
      external_email: 'Email_1',
    },
    rules: {
      lockEmailIfMailchimpIdExists: true,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tenantConfigModule.setTenantConfig(mockTenant);
  });

  describe('processMailchimpWebhookEvent', () => {
    it('maps Mailchimp data and writes to Grist with loop prevention markers', async () => {
      const payload = {
        data: {
          id: 'mc-contact-1',
          email: 'sarah@example.com',
          merges: { FNAME: 'Sarah' },
        },
      };

      await processMailchimpWebhookEvent('client-test', 'subscribe', payload);

      expect(gristService.writeToGrist).toHaveBeenCalledWith(
        mockTenant,
        expect.objectContaining({
          Email_1: 'sarah@example.com',
          First_Name: 'Sarah',
          Mailchimp_ID: 'mc-contact-1',
          Sync_Source: 'Mailchimp',
          Sync_Checksum: expect.any(String),
        })
      );
    });
  });

  describe('processGristStagedEvent', () => {
    it('drops event immediately if Sync_Source is Mailchimp (loop prevention)', async () => {
      const payload = {
        id: 10,
        record: {
          Sync_Source: 'Mailchimp',
          Email_1: 'sarah@example.com',
        },
      };

      await processGristStagedEvent('client-test', 'update', payload);

      expect(mailchimpService.upsertMailchimpMember).not.toHaveBeenCalled();
      expect(gristService.writeToGrist).not.toHaveBeenCalled();
    });

    it('enforces field lock and syncs allowed fields for connected contacts', async () => {
      const payload = {
        id: 20,
        record: {
          Mailchimp_ID: 'existing-mc-id',
          Email_1: 'hacked@example.com', // locked field
          First_Name: 'UpdatedName',     // allowed field
        },
      };

      await processGristStagedEvent('client-test', 'update', payload);

      // Should call Mailchimp upsert without the changed email
      expect(mailchimpService.upsertMailchimpMember).toHaveBeenCalled();
      // Should NOT write back Mailchimp ID since it already had one
      expect(gristService.writeToGrist).not.toHaveBeenCalled();
    });

    it('syncs unconnected contact and writes back assigned Mailchimp ID', async () => {
      const payload = {
        id: 30,
        record: {
          Email_1: 'alex@example.com',
          First_Name: 'Alex',
        },
      };

      await processGristStagedEvent('client-test', 'subscribe', payload);

      expect(mailchimpService.upsertMailchimpMember).toHaveBeenCalledWith(
        mockTenant,
        expect.objectContaining({
          email_address: 'alex@example.com',
        })
      );

      expect(gristService.writeToGrist).toHaveBeenCalledWith(
        mockTenant,
        {
          Mailchimp_ID: 'assigned-mc-id-999',
          Sync_Source: 'Microservice',
        },
        30
      );
    });
  });

  describe('handleDeadLetterJob', () => {
    it('writes failure entry to Grist Sync_Logs table', async () => {
      const mockJob: any = {
        data: {
          tenantId: 'client-test',
          eventId: 'err-evt-404',
          payload: { test: 'bad' },
        },
      };

      await handleDeadLetterJob(mockJob, new Error('Fatal network timeout'));

      expect(gristService.writeSyncLog).toHaveBeenCalledWith(
        mockTenant,
        'err-evt-404',
        'Fatal network timeout',
        { test: 'bad' }
      );
    });
  });

  describe('Redis Contact Mutex', () => {
    it('acquires lock with NX and EX 30s TTL when available', async () => {
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      const token = await acquireContactLock('client-test', 'user@example.com', 30);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(redisClient.set).toHaveBeenCalledWith(
        'lock:contact:client-test:user@example.com',
        token,
        'EX',
        30,
        'NX'
      );
    });

    it('returns null if contact lock is already held by another worker', async () => {
      (redisClient.set as jest.Mock).mockResolvedValue(null);

      const token = await acquireContactLock('client-test', 'contested@example.com', 30);

      expect(token).toBeNull();
    });

    it('releases lock if token matches current value', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue('token-123');

      await releaseContactLock('client-test', 'user@example.com', 'token-123');

      expect(redisClient.get).toHaveBeenCalledWith('lock:contact:client-test:user@example.com');
      expect(redisClient.del).toHaveBeenCalledWith('lock:contact:client-test:user@example.com');
    });

    it('does not delete lock if token has expired or belongs to another process', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue('different-token');

      await releaseContactLock('client-test', 'user@example.com', 'token-123');

      expect(redisClient.del).not.toHaveBeenCalled();
    });

    it('throws retry error in processGristStagedEvent if contact lock cannot be acquired', async () => {
      (redisClient.set as jest.Mock).mockResolvedValue(null);

      const payload = {
        record: {
          First_Name: 'Contested',
          Email_1: 'contested@example.com',
        },
      };

      await expect(
        processGristStagedEvent('client-test', 'update', payload)
      ).rejects.toThrow('Contact lock active for contested@example.com');
    });
  });
});
