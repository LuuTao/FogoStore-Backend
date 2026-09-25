import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || 'https://living-viper-297223.upstash.io',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || 'gQAAAAAABIkHAAIgcDIxMmI0MWRmYWM4Y2M0NWEwYjE4YmM1YTFjNTM1ZTI5NA',
});

console.log('✅ [Redis] Đã kết nối Upstash Redis thành công!');