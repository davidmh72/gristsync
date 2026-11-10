import fs from 'fs';
import path from 'path';
import { RawTenantConfig, TenantConfig } from '../types/sync.types';

const tenantCache = new Map<string, TenantConfig>();

export function resolveEnvValue(val: string): string {
  if (typeof val === 'string' && val.startsWith('env:')) {
    const envKey = val.substring(4);
    return process.env[envKey] || '';
  }
  return val;
}

export function parseRawConfig(raw: RawTenantConfig): TenantConfig {
  return {
    tenantId: raw.tenant_id,
    grist: {
      docId: raw.grist.doc_id,
      tableId: raw.grist.table_id,
      apiUrl: raw.grist.api_url,
      apiKey: resolveEnvValue(raw.grist.api_key),
    },
    mailchimp: {
      listId: raw.mailchimp.list_id,
      apiKey: resolveEnvValue(raw.mailchimp.api_key),
      serverPrefix: raw.mailchimp.server_prefix,
    },
    fieldMapping: raw.field_mapping || {},
    rules: {
      lockEmailIfMailchimpIdExists: raw.rules?.lock_email_if_mailchimp_id_exists ?? true,
    },
  };
}

export function loadTenantConfigs(configDir: string): Map<string, TenantConfig> {
  tenantCache.clear();

  if (!fs.existsSync(configDir)) {
    console.warn(`[Config Loader] Config directory does not exist: ${configDir}`);
    return tenantCache;
  }

  const entries = fs.readdirSync(configDir);
  for (const entry of entries) {
    if (entry.endsWith('.json')) {
      const fullPath = path.join(configDir, entry);
      try {
        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        const rawJson: RawTenantConfig = JSON.parse(fileContent);
        if (rawJson.tenant_id) {
          const parsed = parseRawConfig(rawJson);
          tenantCache.set(parsed.tenantId, parsed);
          console.log(`[Config Loader] Successfully loaded tenant config for: ${parsed.tenantId}`);
        }
      } catch (err: any) {
        console.error(`[Config Loader] Error loading config file ${entry}:`, err.message);
      }
    }
  }

  return tenantCache;
}

export function getTenantConfig(tenantId: string): TenantConfig | undefined {
  return tenantCache.get(tenantId);
}

export function setTenantConfig(config: TenantConfig): void {
  tenantCache.set(config.tenantId, config);
}

export function clearTenantConfigs(): void {
  tenantCache.clear();
}
