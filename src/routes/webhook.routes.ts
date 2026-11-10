import { Router, Request, Response } from 'express';
import { verifyWebhookSignature } from '../middleware/auth.middleware';
import { enqueueWebhookJob } from '../queue/producer';
import { SyncJobData } from '../types/sync.types';

const router = Router();

// Immediate 200 OK webhook ingestion route for Mailchimp / external triggers
router.post('/webhook/:tenantId/mailchimp', verifyWebhookSignature, async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.params.tenantId;
  const rawBody = req.body;

  const eventId = rawBody.data?.id || rawBody.fired_at || cryptoRandomString();
  const actionType = rawBody.type || 'update';

  const jobData: SyncJobData = {
    tenantId,
    eventId,
    source: 'mailchimp',
    action: mapMailchimpAction(actionType),
    payload: rawBody,
    timestamp: new Date().toISOString(),
  };

  try {
    // Enqueue asynchronously to BullMQ
    await enqueueWebhookJob(jobData);

    // Send immediate 200 OK response to prevent provider timeouts or duplicate webhook triggers
    res.status(200).json({
      status: 'success',
      message: 'Webhook received and enqueued successfully.',
      eventId,
    });
  } catch (error: any) {
    console.error(`[Webhook Router] Failed to enqueue job for tenant ${tenantId}:`, error.message);
    // Still return 200 or 500 depending on retry policy; returning 500 lets Mailchimp retry if Redis is down
    res.status(500).json({
      status: 'error',
      message: 'Internal queue ingestion error.',
    });
  }
});

function mapMailchimpAction(type: string): 'subscribe' | 'update' | 'unsubscribe' {
  if (type === 'subscribe') return 'subscribe';
  if (type === 'unsubscribe' || type === 'cleaned') return 'unsubscribe';
  return 'update';
}

function cryptoRandomString(): string {
  return Math.random().toString(36).substring(2, 15);
}

export default router;
