import { Worker, Job } from 'bullmq';
import { redisConnectionOptions } from './connection';
import { SYNC_QUEUE_NAME } from './producer';
import { SyncJobData } from '../types/sync.types';

// Concurrency limit set to 5 parallel jobs to respect external rate limits
const WORKER_CONCURRENCY = 5;

export function startSyncWorker(): Worker<SyncJobData> {
  const worker = new Worker<SyncJobData>(
    SYNC_QUEUE_NAME,
    async (job: Job<SyncJobData>) => {
      const { tenantId, source, action, payload } = job.data;
      
      console.log(`[Worker] Processing job ${job.id} | Tenant: ${tenantId} | Source: ${source} | Action: ${action} | Attempt: ${job.attemptsMade + 1}`);

      // Custom jitter calculation applied during backoff evaluations
      const jitter = Math.random() * 1000;
      
      try {
        // Execute synchronization routing logic based on source
        if (source === 'mailchimp') {
          await processMailchimpWebhookEvent(tenantId, action, payload);
        } else if (source === 'grist') {
          await processGristStagedEvent(tenantId, action, payload);
        } else {
          throw new Error(`Unknown sync source: ${source}`);
        }

        console.log(`[Worker] Job ${job.id} completed successfully.`);
      } catch (error: any) {
        console.error(`[Worker] Job ${job.id} failed on attempt ${job.attemptsMade + 1}: ${error.message}`);
        
        // If max attempts reached, move to Dead Letter queue / audit log handling
        if (job.attemptsMade >= (job.opts.attempts || 5) - 1) {
          console.error(`[Worker] DEAD LETTER: Job ${job.id} exhausted all retry attempts. Routing to DLQ logging.`);
          await handleDeadLetterJob(job, error);
        }

        throw error; // Triggers BullMQ exponential retry with jitter
      }
    },
    {
      connection: redisConnectionOptions,
      concurrency: WORKER_CONCURRENCY,
      settings: {
        backoffStrategy: (attemptsMade: number, type: string, err: Error, job: Job) => {
          // Full jitter backoff formula: random delay between 0 and capped exponential ceiling
          const baseDelay = 2000;
          const maxDelay = 60000;
          const exponential = Math.min(maxDelay, baseDelay * Math.pow(2, attemptsMade));
          const fullJitter = Math.random() * exponential;
          return Math.round(fullJitter);
        },
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker Event] Job ${job.id} has successfully finished.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker Event] Job ${job?.id} failed with error: ${err.message}`);
  });

  console.log(`[Worker] Background worker engine initialized with concurrency limit: ${WORKER_CONCURRENCY}`);
  return worker;
}

async function processMailchimpWebhookEvent(tenantId: string, action: string, payload: any): Promise<void> {
  // Stub for Phase 3 state machine and Grist writeback
  console.log(`[Sync Engine] Processing Mailchimp webhook for tenant [${tenantId}], action [${action}]`);
}

async function processGristStagedEvent(tenantId: string, action: string, payload: any): Promise<void> {
  // Stub for Phase 3 state machine and Mailchimp API push
  console.log(`[Sync Engine] Processing Grist update for tenant [${tenantId}], action [${action}]`);
}

async function handleDeadLetterJob(job: Job<SyncJobData>, error: Error): Promise<void> {
  // Permanent failure logging for Sync_Logs table in Grist
  console.error(`[DLQ Handler] Recording failure for tenant ${job.data.tenantId}, Event ID: ${job.data.eventId}`, {
    error: error.message,
    data: job.data,
  });
}
