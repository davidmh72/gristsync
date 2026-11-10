import { Queue } from 'bullmq';
import { redisConnectionOptions } from './connection';
import { SyncJobData } from '../types/sync.types';

export const SYNC_QUEUE_NAME = 'gristsync-queue';

export const syncQueue = new Queue<SyncJobData>(SYNC_QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000, // Starts at 2s, doubles each attempt (2s, 4s, 8s, 16s, 32s)
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export async function enqueueWebhookJob(data: SyncJobData): Promise<string> {
  const job = await syncQueue.add(`sync:${data.tenantId}:${data.action}`, data, {
    jobId: `${data.tenantId}-${data.source}-${data.eventId || Date.now()}`,
  });

  if (!job.id) {
    throw new Error('Failed to enqueue sync job: Missing job ID');
  }

  return job.id;
}
