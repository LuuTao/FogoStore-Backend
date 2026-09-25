import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || 'https://living-viper-297223.upstash.io',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || 'gQAAAAAABIkHAAIgcDIxMmI0MWRmYWM4Y2M0NWEwYjE4YmM1YTFjNTM1ZTI5NA',
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