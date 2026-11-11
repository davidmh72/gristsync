import { upsertMailchimpMember, fetchMailchimpMergeFields } from '../services/mailchimp.service';
import { TenantConfig } from '../types/sync.types';

describe('Mailchimp Service', () => {
  const mockConfig: TenantConfig = {
    tenantId: 'test-client',
    grist: {
      docId: 'doc1',
      tableId: 'Contacts',
      apiUrl: 'https://grist.example.com',
      apiKey: 'key',
    },
    mailchimp: {
      listId: 'list999',
      apiKey: 'mc-api-key-123',
      serverPrefix: 'us10',
    },
    fieldMapping: {},
    rules: { lockEmailIfMailchimpIdExists: true },
  };

  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('sends PUT request with MD5 hashed email to Mailchimp API', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: 'subscriber-md5-id',
        email_address: 'john@example.com',
        status: 'subscribed',
      }),
    } as any);

    const result = await upsertMailchimpMember(mockConfig, {
      email_address: 'john@example.com',
      merge_fields: { FNAME: 'John' },
    });

    expect(result.id).toBe('subscriber-md5-id');
    expect(result.status).toBe('subscribed');

    // MD5 of 'john@example.com' is 5272379374028678d91f42d2a4501a35
    expect(global.fetch).toHaveBeenCalledWith(
      'https://us10.api.mailchimp.com/3.0/lists/list999/members/d4c74594d841139328695756648b6bd6',
      expect.objectContaining({
        method: 'PUT',
      })
    );
  });

  it('fetches merge fields from Mailchimp list and includes standard fields', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        merge_fields: [
          { tag: 'FNAME', name: 'First Name', type: 'text', required: false },
          { tag: 'LNAME', name: 'Last Name', type: 'text', required: false },
          { tag: 'PHONE', name: 'Phone Number', type: 'phone', required: false },
        ],
      }),
    } as any);

    const fields = await fetchMailchimpMergeFields(mockConfig);

    expect(fields).toHaveLength(5);
    expect(fields[0]).toEqual({ tag: 'EMAIL', name: 'Email Address', type: 'email', required: true });
    expect(fields[1]).toEqual({ tag: 'STATUS', name: 'Subscription Status', type: 'choice', required: false });
    expect(fields[2]).toEqual({ tag: 'FNAME', name: 'First Name', type: 'text', required: false });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://us10.api.mailchimp.com/3.0/lists/list999/merge-fields?count=100',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('throws an error if Mailchimp merge fields API returns non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: jest.fn().mockResolvedValue('API Key Invalid'),
    } as any);

    await expect(fetchMailchimpMergeFields(mockConfig)).rejects.toThrow(
      'Failed to fetch Mailchimp merge fields [401]: API Key Invalid'
    );
  });
});

