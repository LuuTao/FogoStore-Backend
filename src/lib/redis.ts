import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.warn('⚠️ [Redis] Chưa tìm thấy biến môi trường REDIS_URL trong Environment!');
}

const isSecure = redisUrl ? (redisUrl.startsWith('rediss://') || redisUrl.includes('upstash.io')) : false;

export const redis = new Redis(redisUrl || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  // Cấu hình TLS bắt buộc cho Upstash Redis
  tls: isSecure
    ? {
        rejectUnauthorized: false,
      }
    : undefined,
  keepAlive: 10000, // Gửi ping socket mỗi 10 giây để Upstash không ngắt kết nối
  connectTimeout: 10000,
  retryStrategy(times) {
    if (times > 5) {
      console.warn('⚠️ [Redis] Đã thử kết nối 5 lần thất bại. Tạm thời vô hiệu hóa Redis cache.');
      return null;
    }
    return Math.min(times * 1000, 3000);
  },
});

redis.on('connect', () => {
  console.log('✅ [Redis] Đã kết nối thành công tới Upstash Redis qua giao thức TCP/TLS!');
});

redis.on('ready', () => {
  console.log('🚀 [Redis] Caching Server sẵn sàng nhận lệnh truy vấn.');
});

redis.on('error', (err) => {
  console.error('❌ [Redis Error]:', err.message);
});

redis.on('close', () => {
  console.warn('⚠️ [Redis] Đã ngắt kết nối socket với Upstash.');
});

// Kích hoạt kết nối ngầm khi khởi động server
redis.connect().catch((err) => {
  console.error('❌ [Redis Connect Failed]:', err.message);
});