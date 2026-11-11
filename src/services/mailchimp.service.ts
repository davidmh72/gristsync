import crypto from 'crypto';
import { TenantConfig } from '../types/sync.types';
import { MailchimpMemberPayload } from './mapping.service';

export interface MailchimpUpsertResponse {
  id: string;
  email_address: string;
  status: string;
}

/**
 * Upserts a member to a Mailchimp list using subscriber hash or existing Mailchimp ID
 */
export async function upsertMailchimpMember(
  tenantConfig: TenantConfig,
  member: MailchimpMemberPayload
): Promise<MailchimpUpsertResponse> {
  const { serverPrefix, listId, apiKey } = tenantConfig.mailchimp;
  const subscriberHash =
    member.mailchimp_id ||
    (member.email_address
      ? crypto.createHash('md5').update(member.email_address.toLowerCase()).digest('hex')
      : '');

  if (!subscriberHash) {
    throw new Error('Cannot update Mailchimp member: neither email_address nor mailchimp_id provided.');
  }

  const url = `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${listId}/members/${subscriberHash}`;
  const authHeader = `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}`;

  const payload: Record<string, any> = {
    merge_fields: member.merge_fields,
  };

  if (member.email_address) {
    payload.email_address = member.email_address;
    payload.status_if_new = member.status || 'subscribed';
  }

  if (member.status) {
    payload.status = member.status;
  }

  const response = await fetch(url, {
    method: member.email_address ? 'PUT' : 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mailchimp API error [${response.status}]: ${errorText}`);
  }

  const data: any = await response.json();
  return {
    id: data.id || member.mailchimp_id || subscriberHash,
    email_address: data.email_address || member.email_address || '',
    status: data.status || member.status || 'subscribed',
  };
}

export interface MailchimpFieldSchema {
  tag: string;
  name: string;
  type: string;
  required: boolean;
}

/**
 * Fetches standard and custom merge fields for the configured Mailchimp list
 */
export async function fetchMailchimpMergeFields(
  tenantConfig: TenantConfig
): Promise<MailchimpFieldSchema[]> {
  const { serverPrefix, listId, apiKey } = tenantConfig.mailchimp;
  const url = `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${listId}/merge-fields?count=100`;
  const authHeader = `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Mailchimp merge fields [${response.status}]: ${errorText}`);
  }

  const data: any = await response.json();
  const mergeFields: MailchimpFieldSchema[] = (data.merge_fields || []).map((mf: any) => ({
    tag: mf.tag,
    name: mf.name,
    type: mf.type,
    required: !!mf.required,
  }));

  // Always include standard Mailchimp contact fields at the top
  const standardFields: MailchimpFieldSchema[] = [
    { tag: 'EMAIL', name: 'Email Address', type: 'email', required: true },
    { tag: 'STATUS', name: 'Subscription Status', type: 'choice', required: false },
  ];

  return [...standardFields, ...mergeFields];
}

