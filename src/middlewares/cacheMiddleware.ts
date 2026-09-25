import { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis';

/**
 * Middleware cache dữ liệu GET API
 * @param ttlSeconds Thời gian lưu trữ (mặc định 600s = 10 phút)
 */
export const checkCache = (ttlSeconds = 600) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = `fogo_cache:${req.originalUrl}`;

    try {
      if (redis.status !== 'ready') {
        return next();
      }

      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return res.json(JSON.parse(cachedData));
      }

      const originalSend = res.json.bind(res);
      res.json = (body: any): Response => {
        if (res.statusCode >= 200 && res.statusCode < 300 && redis.status === 'ready') {
          redis.set(cacheKey, JSON.stringify(body), 'EX', ttlSeconds).catch((err) => {
            console.error('Lỗi khi ghi Redis cache:', err.message);
          });
        }
        return originalSend(body);
      };

      next();
    } catch {
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
    if (redis.status !== 'ready') return;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`🧹 Đã làm mới ${keys.length} khóa cache (${pattern})`);
    }
  } catch (error: any) {
    console.error('Lỗi xóa cache:', error.message);
  }
};