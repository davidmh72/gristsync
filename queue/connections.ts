import { ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisHost = process.env.REDIS_HOST || 'gristsync-redis';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD;

export const redisConnectionOptions: ConnectionOptions = {
  host: redisHost,
  port: redisPort,
  password: redisPassword || undefined,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
};

// Dedicated IORedis client instance for queue producers and health monitoring
export const redisClient = new IORedis(redisConnectionOptions);

redisClient.on('connect', () => {
  console.log(`[Redis] Connected successfully to ${redisHost}:${redisPort}`);
});

redisClient.on('error', (err) => {
  console.error('[Redis] Connection error:', err);
});
