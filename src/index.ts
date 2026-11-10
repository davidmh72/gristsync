import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import webhookRouter from './routes/webhook.routes';
import { startSyncWorker } from './queue/worker';
import { redisClient } from './queue/connection';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware for parsing JSON bodies
app.use(express.json({ limit: '2mb' }));

// Health Check Endpoint
app.get('/health', async (req: Request, res: Response) => {
  let redisStatus = 'disconnected';
  try {
    const pong = await redisClient.ping();
    if (pong === 'PONG') {
      redisStatus = 'connected';
    }
  } catch (err) {
    redisStatus = 'error';
  }

  res.status(200).json({
    status: 'healthy',
    service: 'grist-mailchimp-sync',
    redis: redisStatus,
    timestamp: new Date().toISOString(),
  });
});

// Mount Webhook & Integration Routes
app.use('/', webhookRouter);

// Initialize BullMQ Background Worker Engine
const syncWorker = startSyncWorker();

// Start Express Server
const server = app.listen(port, () => {
  console.log(`[Sync Microservice] Phase 2 Core Engine online and listening on port ${port}`);
});

// Graceful Shutdown Handling
const shutdown = async () => {
  console.log('[Sync Microservice] Shutting down gracefully...');
  server.close(async () => {
    await syncWorker.close();
    await redisClient.quit();
    console.log('[Sync Microservice] Closed all connections and worker threads.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
