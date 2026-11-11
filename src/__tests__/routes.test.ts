import request from 'supertest';
import express from 'express';
import path from 'path';
import webhookRouter from '../routes/webhook.routes';
import * as producer from '../queue/producer';

// Mock enqueueWebhookJob
jest.mock('../queue/producer', () => ({
  enqueueWebhookJob: jest.fn().mockResolvedValue('test-job-id-123'),
}));

const app = express();
app.use(express.json());
app.use('/widget', express.static(path.join(__dirname, '../../public')));
app.use('/', webhookRouter);

describe('Sync Routes', () => {
  const secret = 'super_secure_master_webhook_secret_here';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /webhook/:tenantId/mailchimp', () => {
    it('enqueues Mailchimp inbound webhook and returns 200 OK', async () => {
      const response = await request(app)
        .post('/webhook/tenant-alpha/mailchimp')
        .set('x-webhook-token', secret)
        .send({
          type: 'subscribe',
          data: {
            id: 'mc-123',
            email: 'user@example.com',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(producer.enqueueWebhookJob).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-alpha',
          source: 'mailchimp',
          action: 'subscribe',
        }),
      );
    });
  });

  describe('POST /api/sync/outbound/:tenantId', () => {
    it('enqueues Grist outbound event and returns 200 OK', async () => {
      const response = await request(app)
        .post('/api/sync/outbound/tenant-alpha')
        .set('x-webhook-token', secret)
        .send({
          id: 42,
          action: 'update',
          record: {
            First_Name: 'Jane',
            Email_1: 'jane@example.com',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(producer.enqueueWebhookJob).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-alpha',
          source: 'grist',
          action: 'update',
          eventId: '42',
        }),
      );
    });
  });

  describe('Static Widget Assets', () => {
    it('serves widget index.html with 200 OK', async () => {
      const response = await request(app).get('/widget/index.html');
      expect(response.status).toBe(200);
      expect(response.text).toContain('GristSync Visual Mapper');
    });

    it('serves widget app.js with 200 OK', async () => {
      const response = await request(app).get('/widget/app.js');
      expect(response.status).toBe(200);
      expect(response.text).toContain('GristSync Custom Widget');
    });
  });
});
