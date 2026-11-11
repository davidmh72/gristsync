import { FieldDirection } from '../types/sync.types';

export interface MailchimpMemberPayload {
  email_address?: string;
  mailchimp_id?: string;
  status?: 'subscribed' | 'unsubscribed' | 'cleaned' | 'pending';
  merge_fields: Record<string, any>;
}

/**
 * Maps a Grist record to Mailchimp subscriber payload format
 */
export function mapGristToMailchimp(
  gristFields: Record<string, any>,
  fieldMapping: Record<string, string>,
  fieldDirections: Record<string, FieldDirection> = {}
): MailchimpMemberPayload {
  let email = '';
  const mergeFields: Record<string, any> = {};

  // Inverted mapping: Grist column name -> External field name
  const gristToExternal: Record<string, string> = {};
  for (const [extField, gristCol] of Object.entries(fieldMapping)) {
    gristToExternal[gristCol] = extField;
  }

  for (const [gristCol, val] of Object.entries(gristFields)) {
    const extName = gristToExternal[gristCol] || gristCol;
    const lowerExt = extName.toLowerCase();

    // Outbound: Mailchimp is the authority for mailchimp_only fields, so strip Grist changes
    if (fieldDirections[lowerExt] === 'mailchimp_only') {
      continue;
    }

    if (lowerExt.includes('email') || lowerExt === 'external_email') {
      email = String(val || '');
    } else if (lowerExt === 'external_first_name' || lowerExt === 'fname') {
      mergeFields['FNAME'] = val;
    } else if (lowerExt === 'external_last_name' || lowerExt === 'lname') {
      mergeFields['LNAME'] = val;
    } else {
      mergeFields[extName.toUpperCase()] = val;
    }
  }

  return {
    email_address: email,
    merge_fields: mergeFields,
  };
}

/**
 * Maps Mailchimp webhook payload data to Grist record columns
 */
export function mapMailchimpToGrist(
  mcData: { email?: string; email_address?: string; id?: string; merges?: Record<string, any>; merge_fields?: Record<string, any> },
  fieldMapping: Record<string, string>,
  fieldDirections: Record<string, FieldDirection> = {}
): Record<string, any> {
  const gristRecord: Record<string, any> = {};
  const email = mcData.email || mcData.email_address || '';
  const merges = mcData.merges || mcData.merge_fields || {};

  // Standard email mapping
  for (const [extField, gristCol] of Object.entries(fieldMapping)) {
    const lowerExt = extField.toLowerCase();

    // Inbound: Grist is the authority for grist_only fields, so strip Mailchimp changes
    if (fieldDirections[lowerExt] === 'grist_only') {
      continue;
    }

    if (lowerExt.includes('email') || lowerExt === 'external_email') {
      gristRecord[gristCol] = email;
    } else if (lowerExt === 'external_first_name' || lowerExt === 'fname') {
      gristRecord[gristCol] = merges.FNAME || merges.FIRST_NAME || '';
    } else if (lowerExt === 'external_last_name' || lowerExt === 'lname') {
      gristRecord[gristCol] = merges.LNAME || merges.LAST_NAME || '';
    } else {
      const tagUpper = extField.toUpperCase();
      if (merges[tagUpper] !== undefined) {
        gristRecord[gristCol] = merges[tagUpper];
      }
    }
  }

  // Always map Mailchimp ID if present
  if (mcData.id) {
    gristRecord['Mailchimp_ID'] = mcData.id;
  }

  return gristRecord;
}
