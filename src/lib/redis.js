// src/lib/redis.js
const IORedis = require('ioredis');

/**
 * Creates a NEW Redis connection from REDIS_URL (Upstash TCP URL, rediss://...).
 * BullMQ needs its own connection per Queue / Worker, so this is a factory,
 * not a shared singleton.
 */
function createRedisConnection(overrides = {}) {
  const url = process.env.REDIS_URL;

  if (!url) {
    throw new Error(
      'REDIS_URL is not set. Add your Upstash TCP URL (rediss://...) to .env or your host environment variables.'
    );
  }
  if (!/^rediss?:\/\//.test(url)) {
    throw new Error(
      'REDIS_URL must start with redis:// or rediss://. Use the Upstash TCP endpoint, not the REST URL.'
    );
  }

  const connection = new IORedis(url, {
    // Required by BullMQ workers (blocking commands must never time out)
    maxRetriesPerRequest: null,
    connectTimeout: 10000,
    ...overrides,
  });

  // Without a listener, a connection error would crash the process
  connection.on('error', (err) => {
    console.error('[redis] connection error:', err.message);
  });

  return connection;
}

module.exports = { createRedisConnection };
