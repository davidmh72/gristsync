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
      fieldDirections: raw.rules?.field_directions || {},
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

export function getTenantByDocId(docId: string): TenantConfig | undefined {
  for (const config of tenantCache.values()) {
    if (config.grist.docId === docId) {
      return config;
    }
  }
  return undefined;
}

export function saveTenantConfigToDisk(rawConfig: RawTenantConfig, configDir: string): TenantConfig {
  if (!rawConfig || !rawConfig.tenant_id) {
    throw new Error('Invalid tenant configuration: tenant_id is required');
  }

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const filePath = path.join(configDir, `${rawConfig.tenant_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(rawConfig, null, 2), 'utf-8');

  const parsed = parseRawConfig(rawConfig);
  tenantCache.set(parsed.tenantId, parsed);
  console.log(`[Config Loader] Saved and registered tenant config for: ${parsed.tenantId}`);
  return parsed;
}

export function setTenantConfig(config: TenantConfig): void {
  tenantCache.set(config.tenantId, config);
}

export function clearTenantConfigs(): void {
  tenantCache.clear();
}

/**
 * Fetches dynamic configuration stored in Grist's GristSync_Config table.
 * If found, merges the dynamic rules/mappings into baseConfig and updates the cache.
 * If table does not exist or fetch fails, falls back safely to baseConfig.
 */
export async function fetchConfigFromGrist(baseConfig: TenantConfig): Promise<TenantConfig> {
  const url = `${baseConfig.grist.apiUrl}/tables/GristSync_Config/records`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${baseConfig.grist.apiKey}`,
      },
    });

    if (!response.ok) {
      return baseConfig;
    }

    const data: any = await response.json();
    const records = data.records || [];
    if (records.length === 0 || !records[0].fields?.Config_Payload) {
      return baseConfig;
    }

    const payload = JSON.parse(records[0].fields.Config_Payload);
    const merged: TenantConfig = {
      ...baseConfig,
      fieldMapping: payload.fieldMapping || baseConfig.fieldMapping,
      rules: {
        ...baseConfig.rules,
        ...(payload.rules || {}),
      },
    };

    tenantCache.set(merged.tenantId, merged);
    return merged;
  } catch (err: any) {
    console.warn(`[Config Loader] Could not fetch dynamic config from Grist for ${baseConfig.tenantId}:`, err.message);
    return baseConfig;
  }
}
