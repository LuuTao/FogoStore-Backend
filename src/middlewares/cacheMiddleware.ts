import { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis';

/**
 * Middleware cache dữ liệu GET API
 * @param ttlSeconds Thời gian lưu trữ (mặc định 600s = 10 phút)
 */
export const checkCache = (ttlSeconds = 600) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Chỉ áp dụng cache cho phương thức GET
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = `fogo_cache:${req.originalUrl}`;

    try {
      // 1. Thử lấy dữ liệu từ Redis
      const cachedData = await redis.get(cacheKey);

      if (cachedData) {
        console.log(`⚡ [Cache HIT] Lấy tức thì từ RAM Redis: ${req.originalUrl}`);
        res.setHeader('X-Cache', 'HIT');
        const parsed = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
        return res.json(parsed);
      }

      console.log(`🐢 [Cache MISS] Đang đọc từ Database Aiven: ${req.originalUrl}`);
      res.setHeader('X-Cache', 'MISS');

      // 2. Can thiệp res.json để lưu vào Redis khi Database trả kết quả
      const originalSend = res.json.bind(res);
      res.json = (body: any): Response => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const stringified = typeof body === 'string' ? body : JSON.stringify(body);
          redis
            .set(cacheKey, stringified, 'EX', ttlSeconds)
            .then(() => {
              console.log(`💾 [Cache SAVED] Đã lưu cache (${ttlSeconds}s): ${cacheKey}`);
            })
            .catch((err) => {
              console.error('❌ Lỗi khi lưu Redis cache:', err.message);
            });
        }
        return originalSend(body);
      };

      next();
    } catch (err: any) {
      console.warn('⚠️ [Redis Bypass] Tạm thời bỏ qua cache do kết nối:', err.message);
      next();
    }
  };
};

/**
 * Hàm xóa cache khi có sự thay đổi dữ liệu (Thêm, Sửa, Xóa hoặc Import Excel)
 * @param pattern Mẫu khóa cần xóa, ví dụ 'fogo_cache:*'
 */
export const clearCachePattern = async (pattern: string) => {
  try {
    const keys = await redis.keys(pattern);
    if (keys && keys.length > 0) {
      await redis.del(...keys);
      console.log(`🧹 [Cache CLEARED] Đã làm mới ${keys.length} khóa cache (${pattern})`);
    }
  } catch (error: any) {
    console.error('❌ Lỗi xóa cache:', error.message);
  }
};