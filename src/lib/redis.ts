import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 2,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 3) {
      console.warn('⚠️ [Redis] Không thể kết nối, tạm thời tắt tính năng cache.');
      return null;
    }
    return 2000;
  },
});

redis.on('connect', () => {
  console.log('✅ [Redis] Đã kết nối thành công tới Redis Caching Server!');
});

redis.on('error', (err) => {
  console.error('❌ [Redis Error]:', err.message);
});

redis.connect().catch(() => {});