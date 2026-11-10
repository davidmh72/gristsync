import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  resolveEnvValue,
  parseRawConfig,
  loadTenantConfigs,
  getTenantConfig,
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
});
