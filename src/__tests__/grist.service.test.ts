import { writeToGrist, writeSyncLog, fetchGristColumns } from '../services/grist.service';
import { TenantConfig } from '../types/sync.types';

describe('Grist Service', () => {
  const mockConfig: TenantConfig = {
    tenantId: 'test-client',
    grist: {
      docId: 'doc123',
      tableId: 'Contacts',
      apiUrl: 'https://grist.example.com/api/docs/doc123',
      apiKey: 'grist-token-abc',
    },
    mailchimp: {
      listId: 'list1',
      apiKey: 'mc-key',
      serverPrefix: 'us20',
    },
    fieldMapping: {},
    rules: { lockEmailIfMailchimpIdExists: true },
  };

  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('sends PATCH request when recordId is provided', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ records: [{ id: 42 }] }),
    } as any);

    const result = await writeToGrist(mockConfig, { First_Name: 'John' }, 42);

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://grist.example.com/api/docs/doc123/tables/Contacts/records',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ records: [{ id: 42, fields: { First_Name: 'John' } }] }),
      })
    );
  });

  it('sends POST request when recordId is not provided', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ records: [{ id: 99 }] }),
    } as any);

    const result = await writeToGrist(mockConfig, { First_Name: 'Alice' });

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://grist.example.com/api/docs/doc123/tables/Contacts/records',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ records: [{ fields: { First_Name: 'Alice' } }] }),
      })
    );
  });

  it('writeSyncLog writes error entry to Sync_Logs table', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true }),
    } as any);

    await writeSyncLog(mockConfig, 'event-101', 'Test Error', { some: 'payload' });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://grist.example.com/api/docs/doc123/tables/Sync_Logs/records',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('fetches column definitions from Grist table', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        columns: [
          { id: 'Email_1', fields: { label: 'Primary Email', type: 'Text' } },
          { id: 'First_Name', fields: { label: 'First Name', type: 'Text' } },
          { id: 'Status', fields: { label: 'Subscription Status', type: 'Choice' } },
        ],
      }),
    } as any);

    const columns = await fetchGristColumns(mockConfig);

    expect(columns).toEqual([
      { id: 'Email_1', label: 'Primary Email', type: 'Text' },
      { id: 'First_Name', label: 'First Name', type: 'Text' },
      { id: 'Status', label: 'Subscription Status', type: 'Choice' },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://grist.example.com/api/docs/doc123/tables/Contacts/columns',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('throws an error if Grist columns API returns an error response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: jest.fn().mockResolvedValue('Table not found'),
    } as any);

    await expect(fetchGristColumns(mockConfig)).rejects.toThrow(
      'Failed to fetch Grist columns [404]: Table not found'
    );
  });
});

