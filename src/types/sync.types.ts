export type FieldDirection = 'two_way' | 'grist_only' | 'mailchimp_only' | 'create_only';

export interface RawTenantConfig {
  tenant_id: string;
  grist: {
    doc_id: string;
    table_id: string;
    api_url: string;
    api_key: string;
  };
  mailchimp: {
    list_id: string;
    api_key: string;
    server_prefix: string;
  };
  field_mapping: Record<string, string>;
  rules?: {
    lock_email_if_mailchimp_id_exists?: boolean;
    field_directions?: Record<string, FieldDirection>;
  };
}

export interface TenantConfig {
  tenantId: string;
  grist: {
    docId: string;
    tableId: string;
    apiUrl: string;
    apiKey: string;
  };
  mailchimp: {
    listId: string;
    apiKey: string;
    serverPrefix: string;
  };
  fieldMapping: Record<string, string>;
  rules: {
    lockEmailIfMailchimpIdExists: boolean;
    fieldDirections?: Record<string, FieldDirection>;
  };
}

export interface MailchimpWebhookPayload {
  type: string;
  fired_at: string;
  data: {
    id: string;
    list_id: string;
    email: string;
    email_type: string;
    merges: Record<string, any>;
    ip_opt?: string;
    ip_signup?: string;
    web_id?: string;
  };
}

export interface SyncJobData {
  tenantId: string;
  eventId: string;
  source: 'mailchimp' | 'grist';
  action: 'subscribe' | 'update' | 'unsubscribe';
  payload: any;
  timestamp: string;
}
