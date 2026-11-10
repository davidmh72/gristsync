import {
  computeChecksum,
  isLoopEvent,
  enforceFieldLock,
} from '../services/safety.service';

describe('Safety Service', () => {
  describe('computeChecksum', () => {
    it('generates consistent sha256 checksums', () => {
      const data = { email: 'test@example.com', first_name: 'Alex' };
      const hash1 = computeChecksum(data);
      const hash2 = computeChecksum(data);
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBe(64);
    });
  });

  describe('isLoopEvent', () => {
    it('returns true when Sync_Source matches Mailchimp', () => {
      const record = { id: 1, Sync_Source: 'Mailchimp', email: 'a@b.com' };
      expect(isLoopEvent(record)).toBe(true);
    });

    it('returns true when case-insensitive sync_source matches', () => {
      const record = { id: 1, sync_source: 'Mailchimp' };
      expect(isLoopEvent(record)).toBe(true);
    });

    it('returns false when Sync_Source is Grist or undefined', () => {
      expect(isLoopEvent({ id: 1, Sync_Source: 'Grist' })).toBe(false);
      expect(isLoopEvent({ id: 1, email: 'user@example.com' })).toBe(false);
      expect(isLoopEvent(null as any)).toBe(false);
    });
  });

  describe('enforceFieldLock', () => {
    it('Rule 1: allows all fields when record is NOT connected (hasMailchimpId = false)', () => {
      const fields = {
        Email: 'new@example.com',
        Status: 'subscribed',
        First_Name: 'Alex',
      };

      const result = enforceFieldLock(fields, false);
      expect(result.isBlocked).toBe(false);
      expect(result.blockedFields).toHaveLength(0);
      expect(result.allowedFields).toEqual(fields);
    });

    it('Rule 2: blocks Email and Status when record IS connected (hasMailchimpId = true)', () => {
      const fields = {
        Email_1: 'hacked@example.com',
        Status: 'unsubscribed',
        First_Name: 'Alex',
        Last_Name: 'Smith',
        Phone: '555-1234',
      };

      const result = enforceFieldLock(fields, true);
      expect(result.isBlocked).toBe(true);
      expect(result.blockedFields).toEqual(expect.arrayContaining(['Email_1', 'Status']));
      expect(result.allowedFields).toEqual({
        First_Name: 'Alex',
        Last_Name: 'Smith',
        Phone: '555-1234',
      });
    });

    it('allows all fields if lockRuleEnabled is explicitly false', () => {
      const fields = {
        Email: 'override@example.com',
        Status: 'pending',
      };

      const result = enforceFieldLock(fields, true, false);
      expect(result.isBlocked).toBe(false);
      expect(result.allowedFields).toEqual(fields);
    });
  });
});
