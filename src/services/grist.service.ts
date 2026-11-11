import { TenantConfig } from '../types/sync.types';

export interface GristWriteResponse {
  success: boolean;
  records?: any[];
  error?: string;
}

/**
 * Upserts a record into the client's Grist table
 */
export async function writeToGrist(
  tenantConfig: TenantConfig,
  fields: Record<string, any>,
  recordId?: number | string
): Promise<GristWriteResponse> {
  const url = `${tenantConfig.grist.apiUrl}/tables/${tenantConfig.grist.tableId}/records`;

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${tenantConfig.grist.apiKey}`,
  };

  const payload = recordId
    ? { records: [{ id: Number(recordId), fields }] }
    : { records: [{ fields }] };

  const method = recordId ? 'PATCH' : 'POST';

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Grist API error [${response.status}]: ${errorText}`);
    }

    const data: any = await response.json();
    return { success: true, records: data.records };
  } catch (err: any) {
    console.error(`[Grist Service] Error writing record to Grist for tenant ${tenantConfig.tenantId}:`, err.message);
    throw err;
  }
}

/**
 * Writes an error entry directly to the client's Sync_Logs table for permanent auditability
 */
export async function writeSyncLog(
  tenantConfig: TenantConfig,
  eventId: string,
  errorMessage: string,
  payload: any
): Promise<void> {
  const url = `${tenantConfig.grist.apiUrl}/tables/Sync_Logs/records`;

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${tenantConfig.grist.apiKey}`,
  };

  const logRecord = {
    records: [
      {
        fields: {
          Event_ID: eventId,
          Error_Message: errorMessage,
          Timestamp: new Date().toISOString(),
          Payload_Snapshot: JSON.stringify(payload).substring(0, 1000),
        },
      },
    ],
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(logRecord),
    });

    if (!response.ok) {
      console.warn(`[Grist Service] Failed to write to Sync_Logs table [${response.status}]`);
    }
  } catch (err: any) {
    console.warn(`[Grist Service] Could not log to Sync_Logs table:`, err.message);
  }
}

export interface GristColumnSchema {
  id: string;
  label: string;
  type: string;
}

/**
 * Fetches column definitions for the configured Grist table
 */
export async function fetchGristColumns(
  tenantConfig: TenantConfig
): Promise<GristColumnSchema[]> {
  const url = `${tenantConfig.grist.apiUrl}/tables/${tenantConfig.grist.tableId}/columns`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${tenantConfig.grist.apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Grist columns [${response.status}]: ${errorText}`);
  }

  const data: any = await response.json();
  return (data.columns || []).map((col: any) => ({
    id: col.id,
    label: col.fields?.label || col.id,
    type: col.fields?.type || 'Text',
  }));
}

