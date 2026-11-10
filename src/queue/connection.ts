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
  lazyConnect: true,
};

// Dedicated IORedis client instance for health monitoring and queue helpers
export const redisClient = new IORedis({
  ...redisConnectionOptions,
  lazyConnect: true,
});

if (process.env.NODE_ENV !== 'test') {
  redisClient.on('connect', () => {
    console.log(`[Redis] Connected successfully to ${redisHost}:${redisPort}`);
  });

  redisClient.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });
}
