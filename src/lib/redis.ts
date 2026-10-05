import { Redis } from '@upstash/redis';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!redisUrl || !redisToken) {
  throw new Error('Thiếu UPSTASH_REDIS_REST_URL hoặc UPSTASH_REDIS_REST_TOKEN.');
}

export const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});

// Tự động test kết nối và đo độ trễ khi khởi động
(async () => {
  try {
    const startTime = Date.now();
    const pingResponse = await redis.ping();
    const latency = Date.now() - startTime;

    if (pingResponse === 'PONG') {
      console.log(`🚀 [Redis Health]: Upstash Redis HOẠT ĐỘNG TỐT (Phản hồi: PONG - Độ trễ: ${latency}ms)`);
    } else {
      console.warn('⚠️ [Redis Health]: Phản hồi lạ từ Redis:', pingResponse);
    }
  } catch (error: any) {
    console.error('❌ [Redis Health]: Lỗi kết nối Upstash Redis:', error.message);
  }
})();
