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
});
