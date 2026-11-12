import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  resolveEnvValue,
  parseRawConfig,
  loadTenantConfigs,
  getTenantConfig,
  getTenantByDocId,
  saveTenantConfigToDisk,
  setTenantConfig,
  clearTenantConfigs,
} from '../config/tenantConfig';
import { RawTenantConfig } from '../types/sync.types';

describe('Tenant Config Loader', () => {
  beforeEach(() => {
    clearTenantConfigs();
    process.env.TEST_SECRET_KEY = 'secret-12345';
  });

  afterEach(() => {
    delete process.env.TEST_SECRET_KEY;
  });

  describe('resolveEnvValue', () => {
    it('resolves env: prefixed keys from process.env', () => {
      expect(resolveEnvValue('env:TEST_SECRET_KEY')).toBe('secret-12345');
    });

    it('returns empty string if env var does not exist', () => {
      expect(resolveEnvValue('env:NON_EXISTENT_KEY')).toBe('');
    });

    it('returns original string if not prefixed with env:', () => {
      expect(resolveEnvValue('plain-api-key')).toBe('plain-api-key');
    });
  });

  describe('parseRawConfig', () => {
    it('correctly maps snake_case JSON to typed TenantConfig', () => {
      const raw: RawTenantConfig = {
        tenant_id: 'tenant-1',
        grist: {
          doc_id: 'doc-123',
          table_id: 'Contacts',
          api_url: 'https://grist.example.com',
          api_key: 'env:TEST_SECRET_KEY',
        },
        mailchimp: {
          list_id: 'list-456',
          api_key: 'plain-mc-key',
          server_prefix: 'us20',
        },
        field_mapping: {
          email: 'Email_Address',
        },
        rules: {
          lock_email_if_mailchimp_id_exists: true,
        },
      };

      const parsed = parseRawConfig(raw);
      expect(parsed.tenantId).toBe('tenant-1');
      expect(parsed.grist.apiKey).toBe('secret-12345');
      expect(parsed.mailchimp.apiKey).toBe('plain-mc-key');
      expect(parsed.rules.lockEmailIfMailchimpIdExists).toBe(true);
    });
  });

  describe('loadTenantConfigs from directory', () => {
    it('loads and caches JSON files from a directory', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gristsync-configs-'));
      const sampleConfig: RawTenantConfig = {
        tenant_id: 'client-alpha',
        grist: {
          doc_id: 'xyz123abc',
          table_id: 'Contacts',
          api_url: 'https://grist.test',
          api_key: 'env:TEST_SECRET_KEY',
        },
        mailchimp: {
          list_id: 'list1',
          api_key: 'mc-key',
          server_prefix: 'us1',
        },
        field_mapping: {
          email: 'Email',
        },
      };

      fs.writeFileSync(
        path.join(tempDir, 'client-alpha.json'),
        JSON.stringify(sampleConfig, null, 2),
      );

      loadTenantConfigs(tempDir);
      const retrieved = getTenantConfig('client-alpha');
      expect(retrieved).toBeDefined();
      expect(retrieved?.tenantId).toBe('client-alpha');
      expect(retrieved?.grist.apiKey).toBe('secret-12345');

      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });
      });
      });

      describe('getTenantByDocId', () => {
      it('returns the tenant matching the specified docId', () => {
      const tenantA = {
        tenantId: 'tenant-a',
        grist: {
          docId: 'doc-aaa',
          tableId: 'Contacts',
          apiUrl: 'https://grist.test/api/docs/doc-aaa',
          apiKey: 'key-a',
        },
        mailchimp: {
          listId: 'list-a',
          apiKey: 'mc-a',
          serverPrefix: 'us1',
        },
        fieldMapping: { email: 'Email' },
        rules: { lockEmailIfMailchimpIdExists: true },
      };

      const tenantB = {
        tenantId: 'tenant-b',
        grist: {
          docId: 'doc-bbb',
          tableId: 'Clients',
          apiUrl: 'https://grist.test/api/docs/doc-bbb',
          apiKey: 'key-b',
        },
        mailchimp: {
          listId: 'list-b',
          apiKey: 'mc-b',
          serverPrefix: 'us2',
        },
        fieldMapping: { email: 'Email' },
        rules: { lockEmailIfMailchimpIdExists: true },
      };

      setTenantConfig(tenantA);
      setTenantConfig(tenantB);

      const found = getTenantByDocId('doc-bbb');
      expect(found).toBeDefined();
      expect(found?.tenantId).toBe('tenant-b');
      expect(found?.grist.docId).toBe('doc-bbb');
      });

      it('returns undefined when no tenant has matching docId', () => {
      const found = getTenantByDocId('non-existent-doc');
      expect(found).toBeUndefined();
      });
      });

      describe('saveTenantConfigToDisk', () => {
      it('persists a new raw tenant config JSON file and registers it in cache', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gristsync-save-'));
      const newRaw: RawTenantConfig = {
        tenant_id: 'dynamic-tenant-1',
        grist: {
          doc_id: 'doc-dynamic-999',
          table_id: 'Contacts',
          api_url: 'http://grist:8484/api/docs/doc-dynamic-999',
          api_key: 'env:TEST_SECRET_KEY',
        },
        mailchimp: {
          list_id: 'list-dyn',
          api_key: 'mc-dyn-key',
          server_prefix: 'us20',
        },
        field_mapping: {
          email: 'Email_1',
        },
        rules: {
          lock_email_if_mailchimp_id_exists: true,
        },
      };

      const saved = saveTenantConfigToDisk(newRaw, tempDir);
      expect(saved.tenantId).toBe('dynamic-tenant-1');
      expect(saved.grist.docId).toBe('doc-dynamic-999');
      expect(saved.grist.apiKey).toBe('secret-12345');

      // Verify file exists on disk
      const filePath = path.join(tempDir, 'dynamic-tenant-1.json');
      expect(fs.existsSync(filePath)).toBe(true);
      const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(fileContent.tenant_id).toBe('dynamic-tenant-1');
      expect(fileContent.grist.doc_id).toBe('doc-dynamic-999');

      // Verify cached
      const cached = getTenantConfig('dynamic-tenant-1');
      expect(cached).toBeDefined();
      expect(cached?.grist.docId).toBe('doc-dynamic-999');

      fs.rmSync(tempDir, { recursive: true, force: true });
      });

      it('throws an error if tenant_id is missing', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gristsync-save-err-'));
      const invalidRaw = {
        grist: { doc_id: 'doc1' },
      } as any;

      expect(() => saveTenantConfigToDisk(invalidRaw, tempDir)).toThrow('Invalid tenant configuration: tenant_id is required');
      fs.rmSync(tempDir, { recursive: true, force: true });
      });
      });

  describe('fetchConfigFromGrist', () => {
    const baseConfig = {
      tenantId: 'client-alpha',
      grist: {
        docId: 'doc123',
        tableId: 'Contacts',
        apiUrl: 'https://grist.example.com/api/docs/doc123',
        apiKey: 'grist-api-key',
      },
      mailchimp: {
        listId: 'list999',
        apiKey: 'mc-api-key',
        serverPrefix: 'us20',
      },
      fieldMapping: {
        email: 'Email_1',
      },
      rules: {
        lockEmailIfMailchimpIdExists: true,
      },
    };

    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('fetches remote configuration from GristSync_Config table and merges it', async () => {
      const remotePayload = {
        fieldMapping: {
          email: 'Email_1',
          fname: 'First_Name',
          lname: 'Last_Name',
        },
        rules: {
          lockEmailIfMailchimpIdExists: false,
          fieldDirections: {
            email: 'mailchimp_only',
            fname: 'two_way',
          },
        },
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          records: [
            {
              id: 1,
              fields: {
                Config_Payload: JSON.stringify(remotePayload),
              },
            },
          ],
        }),
      } as any);

      const { fetchConfigFromGrist } = require('../config/tenantConfig');
      const updated = await fetchConfigFromGrist(baseConfig);

      expect(updated.fieldMapping).toEqual(remotePayload.fieldMapping);
      expect(updated.rules.lockEmailIfMailchimpIdExists).toBe(false);
      expect(updated.rules.fieldDirections).toEqual(remotePayload.rules.fieldDirections);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://grist.example.com/api/docs/doc123/tables/GristSync_Config/records',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('falls back to base config if GristSync_Config table does not exist', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: jest.fn().mockResolvedValue('Table not found'),
      } as any);

      const { fetchConfigFromGrist } = require('../config/tenantConfig');
      const updated = await fetchConfigFromGrist(baseConfig);

      expect(updated).toEqual(baseConfig);
    });
  });
});
