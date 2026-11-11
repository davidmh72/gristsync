import {
  mapGristToMailchimp,
  mapMailchimpToGrist,
} from '../services/mapping.service';

describe('Mapping Service', () => {
  const sampleMapping = {
    external_first_name: 'First_Name',
    external_last_name: 'Last_Name',
    external_email: 'Email_1',
    company: 'Company_Name',
  };

  it('maps Grist record to Mailchimp subscriber payload', () => {
    const gristRecord = {
      First_Name: 'John',
      Last_Name: 'Doe',
      Email_1: 'john.doe@example.com',
      Company_Name: 'Acme Corp',
    };

    const result = mapGristToMailchimp(gristRecord, sampleMapping);

    expect(result.email_address).toBe('john.doe@example.com');
    expect(result.merge_fields).toEqual({
      FNAME: 'John',
      LNAME: 'Doe',
      COMPANY: 'Acme Corp',
    });
  });

  it('maps Mailchimp data back to Grist columns', () => {
    const mcData = {
      id: 'mc-98765',
      email: 'jane.smith@example.com',
      merges: {
        FNAME: 'Jane',
        LNAME: 'Smith',
        COMPANY: 'Globex',
      },
    };

    const result = mapMailchimpToGrist(mcData, sampleMapping);

    expect(result.Email_1).toBe('jane.smith@example.com');
    expect(result.First_Name).toBe('Jane');
    expect(result.Last_Name).toBe('Smith');
    expect(result.Company_Name).toBe('Globex');
    expect(result.Mailchimp_ID).toBe('mc-98765');
  });

  describe('Field Directionality Enforcement', () => {
    it('strips mailchimp_only fields from outbound Grist to Mailchimp mapping', () => {
      const gristRecord = {
        First_Name: 'John',
        Last_Name: 'Doe',
        Email_1: 'john.doe@example.com',
        Company_Name: 'Acme Corp',
      };

      const directions = {
        external_first_name: 'two_way' as const,
        external_last_name: 'two_way' as const,
        external_email: 'mailchimp_only' as const,
        company: 'mailchimp_only' as const,
      };

      const result = mapGristToMailchimp(gristRecord, sampleMapping, directions);

      // email and company should be stripped because Mailchimp is the sole authority
      expect(result.email_address).toBe('');
      expect(result.merge_fields).toEqual({
        FNAME: 'John',
        LNAME: 'Doe',
      });
      expect(result.merge_fields.COMPANY).toBeUndefined();
    });

    it('strips grist_only fields from inbound Mailchimp to Grist mapping', () => {
      const mcData = {
        id: 'mc-98765',
        email: 'jane.smith@example.com',
        merges: {
          FNAME: 'Jane',
          LNAME: 'Smith',
          COMPANY: 'Globex',
        },
      };

      const directions = {
        external_first_name: 'two_way' as const,
        external_last_name: 'two_way' as const,
        external_email: 'two_way' as const,
        company: 'grist_only' as const,
      };

      const result = mapMailchimpToGrist(mcData, sampleMapping, directions);

      // Company_Name should NOT be overwritten by Mailchimp because Grist is the sole authority
      expect(result.Email_1).toBe('jane.smith@example.com');
      expect(result.First_Name).toBe('Jane');
      expect(result.Last_Name).toBe('Smith');
      expect(result.Company_Name).toBeUndefined();
      expect(result.Mailchimp_ID).toBe('mc-98765');
    });
  });
});
