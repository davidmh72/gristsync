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
