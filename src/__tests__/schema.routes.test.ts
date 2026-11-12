import request from 'supertest';
import express from 'express';
import schemaRouter from '../routes/schema.routes';
import * as tenantConfigModule from '../config/tenantConfig';
import * as mailchimpService from '../services/mailchimp.service';
import * as gristService from '../services/grist.service';

jest.mock('../config/tenantConfig');
jest.mock('../services/mailchimp.service');
jest.mock('../services/grist.service');

const app = express();
app.use(express.json());
app.use('/', schemaRouter);

describe('Schema Routes', () => {
  const mockConfig = {
    tenantId: 'client-alpha',
    grist: {
      docId: 'doc123',
      tableId: 'Contacts',
      apiUrl: 'https://grist.example.com/api/docs/doc123',
      apiKey: 'secret-grist-key',
    },
    mailchimp: {
      listId: 'list-xyz',
      apiKey: 'secret-mc-key',
      serverPrefix: 'us20',
    },
    fieldMapping: {
      First_Name: 'FNAME',
    },
    rules: {
      lockEmailIfMailchimpIdExists: true,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/schema/mailchimp/:tenantId', () => {
    it('returns Mailchimp merge fields on success', async () => {
      (tenantConfigModule.getTenantConfig as jest.Mock).mockReturnValue(mockConfig);
      (mailchimpService.fetchMailchimpMergeFields as jest.Mock).mockResolvedValue([
        { tag: 'EMAIL', name: 'Email Address', type: 'email', required: true },
        { tag: 'FNAME', name: 'First Name', type: 'text', required: false },
      ]);

      const res = await request(app).get('/api/schema/mailchimp/client-alpha');

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe('client-alpha');
      expect(res.body.listId).toBe('list-xyz');
      expect(res.body.fields).toHaveLength(2);
      expect(res.body.fields[0].tag).toBe('EMAIL');
    });

    it('returns 404 if tenant does not exist', async () => {
      (tenantConfigModule.getTenantConfig as jest.Mock).mockReturnValue(undefined);

      const res = await request(app).get('/api/schema/mailchimp/unknown-tenant');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('returns 502 if Mailchimp API throws an error', async () => {
      (tenantConfigModule.getTenantConfig as jest.Mock).mockReturnValue(mockConfig);
      (mailchimpService.fetchMailchimpMergeFields as jest.Mock).mockRejectedValue(
        new Error('Unauthorized API key')
      );

      const res = await request(app).get('/api/schema/mailchimp/client-alpha');

      expect(res.status).toBe(502);
      expect(res.body.error).toContain('Unauthorized API key');
    });
  });

  describe('GET /api/schema/grist/:tenantId', () => {
    it('returns Grist table columns on success', async () => {
      (tenantConfigModule.getTenantConfig as jest.Mock).mockReturnValue(mockConfig);
      (gristService.fetchGristColumns as jest.Mock).mockResolvedValue([
        { id: 'First_Name', label: 'First Name', type: 'Text' },
        { id: 'Email_1', label: 'Email', type: 'Text' },
      ]);

      const res = await request(app).get('/api/schema/grist/client-alpha');

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe('client-alpha');
      expect(res.body.docId).toBe('doc123');
      expect(res.body.tableId).toBe('Contacts');
      expect(res.body.columns).toHaveLength(2);
    });

    it('returns 404 if tenant does not exist', async () => {
      (tenantConfigModule.getTenantConfig as jest.Mock).mockReturnValue(undefined);

      const res = await request(app).get('/api/schema/grist/unknown-tenant');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('returns 502 if Grist API throws an error', async () => {
      (tenantConfigModule.getTenantConfig as jest.Mock).mockReturnValue(mockConfig);
      (gristService.fetchGristColumns as jest.Mock).mockRejectedValue(
        new Error('Grist table not found')
      );

      const res = await request(app).get('/api/schema/grist/client-alpha');

      expect(res.status).toBe(502);
      expect(res.body.error).toContain('Grist table not found');
    });
  });

  describe('GET /api/schema/config/:tenantId', () => {
    it('returns configuration details with secrets omitted', async () => {
      (tenantConfigModule.getTenantConfig as jest.Mock).mockReturnValue(mockConfig);

      const res = await request(app).get('/api/schema/config/client-alpha');

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe('client-alpha');
      expect(res.body.fieldMapping).toEqual({ First_Name: 'FNAME' });
      expect(res.body.rules).toEqual({ lockEmailIfMailchimpIdExists: true });
      // Ensure API keys are not exposed
      expect(res.body.grist.apiKey).toBeUndefined();
      expect(res.body.mailchimp.apiKey).toBeUndefined();
    });

    it('returns 404 if tenant not found', async () => {
      (tenantConfigModule.getTenantConfig as jest.Mock).mockReturnValue(undefined);

      const res = await request(app).get('/api/schema/config/unknown');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/schema/config/:tenantId', () => {
    it('updates tenant configuration and returns 200 OK', async () => {
      const existingConfig = { ...mockConfig };
      (tenantConfigModule.getTenantConfig as jest.Mock).mockReturnValue(existingConfig);

      const updatePayload = {
        fieldMapping: {
          First_Name: 'FNAME',
          Email_1: 'EMAIL',
        },
        rules: {
          lockEmailIfMailchimpIdExists: false,
          fieldDirections: {
            email: 'mailchimp_only',
            fname: 'two_way',
          },
        },
      };

      const res = await request(app)
        .post('/api/schema/config/client-alpha')
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(tenantConfigModule.setTenantConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'client-alpha',
          fieldMapping: updatePayload.fieldMapping,
          rules: expect.objectContaining({
            lockEmailIfMailchimpIdExists: false,
            fieldDirections: {
              email: 'mailchimp_only',
              fname: 'two_way',
            },
          }),
        })
      );
    });

    it('returns 404 if tenant does not exist', async () => {
      (tenantConfigModule.getTenantConfig as jest.Mock).mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/schema/config/unknown-tenant')
        .send({ fieldMapping: {} });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('GET /api/schema/tenant-by-doc/:docId', () => {
    it('returns tenant metadata when a document ID matches', async () => {
      (tenantConfigModule.getTenantByDocId as jest.Mock).mockReturnValue(mockConfig);

      const res = await request(app).get('/api/schema/tenant-by-doc/doc123');

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe('client-alpha');
      expect(res.body.docId).toBe('doc123');
      expect(res.body.tableId).toBe('Contacts');
    });

    it('returns 404 if no tenant is found for the docId', async () => {
      (tenantConfigModule.getTenantByDocId as jest.Mock).mockReturnValue(undefined);

      const res = await request(app).get('/api/schema/tenant-by-doc/non-existent-doc');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('No tenant configured');
    });
  });

  describe('POST /api/schema/tenant/init', () => {
    it('creates a new tenant configuration and returns 201 Created', async () => {
      const createdConfig = {
        tenantId: 'tenant-test1234',
        grist: {
          docId: 'doc-auto-1',
          tableId: 'Contacts',
          apiUrl: 'http://grist:8484/api/docs/doc-auto-1',
          apiKey: 'key-g-1',
        },
        mailchimp: {
          listId: 'list-mc-1',
          apiKey: 'key-mc-1',
          serverPrefix: 'us20',
        },
        fieldMapping: { email: 'Email_1' },
        rules: { lockEmailIfMailchimpIdExists: true },
      };

      (tenantConfigModule.saveTenantConfigToDisk as jest.Mock).mockReturnValue(createdConfig);

      const initPayload = {
        docId: 'doc-auto-1',
        gristApiUrl: 'http://grist:8484/api/docs/doc-auto-1',
        gristApiKey: 'key-g-1',
        mailchimpListId: 'list-mc-1',
        mailchimpApiKey: 'key-mc-1',
        mailchimpServerPrefix: 'us20',
      };

      const res = await request(app)
        .post('/api/schema/tenant/init')
        .send(initPayload);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.tenantId).toBe('tenant-test1234');
      expect(res.body.config.grist.docId).toBe('doc-auto-1');
      expect(res.body.config.grist.apiKey).toBeUndefined(); // Secrets omitted
      expect(tenantConfigModule.saveTenantConfigToDisk).toHaveBeenCalled();
    });

    it('returns 400 if required initialization parameters are missing', async () => {
      const invalidPayload = {
        docId: 'doc-auto-1',
        // missing keys & urls
      };

      const res = await request(app)
        .post('/api/schema/tenant/init')
        .send(invalidPayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required parameters');
    });
  });
});
