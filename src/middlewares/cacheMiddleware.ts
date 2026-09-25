import { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis';

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
        console.log(`⚡ [Cache HIT]: ${req.originalUrl}`);
        res.setHeader('X-Cache', 'HIT');
        return res.json(JSON.parse(cachedData));
      }

      console.log(`🐢 [Cache MISS]: ${req.originalUrl}`);
      res.setHeader('X-Cache', 'MISS');

      const originalSend = res.json.bind(res);
      res.json = (body: any): Response => {
        if (res.statusCode >= 200 && res.statusCode < 300 && redis.status === 'ready') {
          redis
            .set(cacheKey, JSON.stringify(body), 'EX', ttlSeconds)
            .then(() => {
              console.log(`💾 [Cache SAVED] ${cacheKey} (${ttlSeconds}s)`);
            })
            .catch((err) => {
              console.error('❌ Lỗi lưu cache:', err.message);
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

export const clearCachePattern = async (pattern: string) => {
  try {
    if (redis.status !== 'ready') return;
    const keys = await redis.keys(pattern);
    if (keys && keys.length > 0) {
      await redis.del(...keys);
      console.log(`🧹 [Cache CLEARED] Đã dọn dẹp ${keys.length} keys (${pattern})`);
    }
  } catch (error: any) {
    console.error('❌ Lỗi xóa cache:', error.message);
  }
};