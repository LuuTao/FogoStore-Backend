import { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis';

export const checkCache = (ttlSeconds = 600) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next();

    const cacheKey = `fogo_cache:${req.originalUrl}`;

    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        console.log(`⚡ [Cache HIT]: ${req.originalUrl}`);
        res.setHeader('X-Cache', 'HIT');
        const parsed = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
        return res.json(parsed);
      }

      console.log(`🐢 [Cache MISS]: ${req.originalUrl}`);
      res.setHeader('X-Cache', 'MISS');

      const originalSend = res.json.bind(res);
      res.json = (body: any): Response => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const stringified = typeof body === 'string' ? body : JSON.stringify(body);
          redis.set(cacheKey, stringified, { ex: ttlSeconds }).catch(() => {});
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
    const keys = await redis.keys(pattern);
    if (keys && keys.length > 0) {
      await redis.del(...keys);
      console.log(`🧹 [Cache CLEARED] Đã xóa ${keys.length} keys`);
    }
  } catch (error: any) {
    console.error('Lỗi clear cache:', error.message);
  }
};