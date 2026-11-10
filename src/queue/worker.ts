import { Worker, Job, BackoffStrategy } from 'bullmq';
import { redisConnectionOptions } from './connection';
import { SYNC_QUEUE_NAME } from './producer';
import { SyncJobData } from '../types/sync.types';
import { getTenantConfig } from '../config/tenantConfig';
import { isLoopEvent, computeChecksum, enforceFieldLock } from '../services/safety.service';
import { mapGristToMailchimp, mapMailchimpToGrist } from '../services/mapping.service';
import { writeToGrist, writeSyncLog } from '../services/grist.service';
import { upsertMailchimpMember } from '../services/mailchimp.service';

// Concurrency limit set to 5 parallel jobs to respect external rate limits
const WORKER_CONCURRENCY = 5;

export function startSyncWorker(): Worker<SyncJobData> {
  const worker = new Worker<SyncJobData>(
    SYNC_QUEUE_NAME,
    async (job: Job<SyncJobData>) => {
      const { tenantId, source, action, payload } = job.data;
      
      console.log(`[Worker] Processing job ${job.id} | Tenant: ${tenantId} | Source: ${source} | Action: ${action} | Attempt: ${job.attemptsMade + 1}`);

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
        backoffStrategy: ((attemptsMade: number, type?: string, err?: Error, job?: Job) => {
          // Full jitter backoff formula: random delay between 0 and capped exponential ceiling
          const baseDelay = 2000;
          const maxDelay = 60000;
          const exponential = Math.min(maxDelay, baseDelay * Math.pow(2, attemptsMade));
          const fullJitter = Math.random() * exponential;
          return Math.round(fullJitter);
        }) as BackoffStrategy,
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

export async function processMailchimpWebhookEvent(tenantId: string, action: string, payload: any): Promise<void> {
  const tenantConfig = getTenantConfig(tenantId);
  if (!tenantConfig) {
    throw new Error(`Tenant configuration not found for: ${tenantId}`);
  }

  const mcData = payload.data || payload;
  const gristFields = mapMailchimpToGrist(mcData, tenantConfig.fieldMapping);

  // Set Loop Prevention markers
  gristFields.Sync_Source = 'Mailchimp';
  gristFields.Sync_Checksum = computeChecksum(gristFields);

  console.log(`[Worker] Writing Mailchimp contact [${mcData.email || mcData.id}] to Grist for tenant [${tenantId}]`);
  await writeToGrist(tenantConfig, gristFields);
}

export async function processGristStagedEvent(tenantId: string, action: string, payload: any): Promise<void> {
  const tenantConfig = getTenantConfig(tenantId);
  if (!tenantConfig) {
    throw new Error(`Tenant configuration not found for: ${tenantId}`);
  }

  const rawFields = payload.record?.fields || payload.record || payload.fields || payload;
  const recordId = payload.id || payload.record?.id;

  // 1. Loop Prevention Check
  if (isLoopEvent(rawFields, 'Mailchimp')) {
    console.log(`[Worker] Dropping loop event for tenant [${tenantId}], record [${recordId}]: marked as written by Mailchimp.`);
    return;
  }

  // 2. Pre- vs Post-Connection Field Lock
  const hasMailchimpId = Boolean(rawFields.Mailchimp_ID || rawFields.mailchimp_id);
  const lockRuleEnabled = tenantConfig.rules.lockEmailIfMailchimpIdExists;
  const { allowedFields, blockedFields, isBlocked } = enforceFieldLock(
    rawFields,
    hasMailchimpId,
    lockRuleEnabled
  );

  if (isBlocked) {
    console.warn(`[Worker] Intercepted and blocked modifications to locked fields [${blockedFields.join(', ')}] on connected contact for tenant [${tenantId}].`);
  }

  // 3. Map to Mailchimp subscriber payload
  const mcMember = mapGristToMailchimp(allowedFields, tenantConfig.fieldMapping);
  if (hasMailchimpId) {
    mcMember.mailchimp_id = rawFields.Mailchimp_ID || rawFields.mailchimp_id;
  }

  if (!mcMember.email_address && !mcMember.mailchimp_id) {
    console.warn(`[Worker] Skipping Mailchimp push for tenant [${tenantId}]: no email address or Mailchimp ID found.`);
    return;
  }

  // 4. Push to Mailchimp
  const mcResult = await upsertMailchimpMember(tenantConfig, mcMember);
  console.log(`[Worker] Successfully synced member [${mcMember.email_address}] to Mailchimp (ID: ${mcResult.id})`);

  // 5. If this was an unconnected contact (no previous Mailchimp_ID), write back the assigned MailchimpID to Grist
  if (!hasMailchimpId && mcResult.id && recordId) {
    console.log(`[Worker] Writing back assigned Mailchimp ID [${mcResult.id}] to Grist record [${recordId}]`);
    await writeToGrist(
      tenantConfig,
      {
        Mailchimp_ID: mcResult.id,
        Sync_Source: 'Microservice',
      },
      recordId
    );
  }
}

export async function handleDeadLetterJob(job: Job<SyncJobData>, error: Error): Promise<void> {
  const tenantConfig = getTenantConfig(job.data.tenantId);
  if (tenantConfig) {
    await writeSyncLog(tenantConfig, job.data.eventId, error.message, job.data.payload);
  } else {
    console.error(`[DLQ Handler] Failed to log to Grist: no tenant config for ${job.data.tenantId}`);
  }
}
