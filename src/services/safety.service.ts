import crypto from 'crypto';

export interface SanitizeResult {
  allowedFields: Record<string, any>;
  blockedFields: string[];
  isBlocked: boolean;
}

const LOCKED_FIELD_NAMES = new Set([
  'email',
  'email_address',
  'email_1',
  'status',
  'subscription_status',
]);

/**
 * Computes a deterministic SHA256 checksum for a payload
 */
export function computeChecksum(payload: any): string {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload, Object.keys(payload || {}).sort());
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

/**
 * Checks whether an incoming Grist event is an echo/loop triggered by our own prior write
 */
export function isLoopEvent(record: Record<string, any>, expectedSource = 'Mailchimp'): boolean {
  if (!record) return false;

  const syncSource = record.Sync_Source || record.sync_source;
  if (syncSource === expectedSource) {
    return true;
  }

  return false;
}

/**
 * Enforces the Pre- vs. Post-Connection Email & Status Lock:
 * - If record has NO Mailchimp ID: Grist is master, all fields allowed.
 * - If record HAS a Mailchimp ID: Email and Status fields cannot be modified via Grist updates.
 */
export function enforceFieldLock(
  fields: Record<string, any>,
  hasMailchimpId: boolean,
  lockRuleEnabled: boolean = true
): SanitizeResult {
  if (!hasMailchimpId || !lockRuleEnabled) {
    return {
      allowedFields: { ...fields },
      blockedFields: [],
      isBlocked: false,
    };
  }

  const allowedFields: Record<string, any> = {};
  const blockedFields: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    const normalizedKey = key.toLowerCase();
    if (LOCKED_FIELD_NAMES.has(normalizedKey)) {
      blockedFields.push(key);
    } else {
      allowedFields[key] = value;
    }
  }

  return {
    allowedFields,
    blockedFields,
    isBlocked: blockedFields.length > 0,
  };
}
