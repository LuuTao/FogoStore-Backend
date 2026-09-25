import { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis';

/**
 * Middleware cache dữ liệu GET API dùng ioredis
 * @param ttlSeconds Thời gian lưu trữ (mặc định 600s = 10 phút)
 */
export const checkCache = (ttlSeconds = 600) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Chỉ cache các request GET
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = `fogo_cache:${req.originalUrl}`;

    try {
      // 1. Thử lấy dữ liệu từ RAM Upstash
      const cachedData = await redis.get(cacheKey);

      if (cachedData) {
        console.log(`⚡ [Cache HIT]: ${req.originalUrl}`);
        res.setHeader('X-Cache', 'HIT');
        const parsed = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
        return res.json(parsed);
      }

      console.log(`🐢 [Cache MISS]: ${req.originalUrl}`);
      res.setHeader('X-Cache', 'MISS');

      // 2. Can thiệp res.json để lưu vào Redis khi Database trả kết quả
      const originalSend = res.json.bind(res);
      res.json = (body: any): Response => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const stringified = typeof body === 'string' ? body : JSON.stringify(body);
          // Cú pháp chuẩn của ioredis: 'EX', ttlSeconds
          redis
            .set(cacheKey, stringified, 'EX', ttlSeconds)
            .then(() => {
              console.log(`💾 [Cache SAVED] ${cacheKey} (${ttlSeconds}s)`);
            })
            .catch((err: any) => {
              console.error('❌ Lỗi lưu cache:', err.message);
            });
        }
        return originalSend(body);
      };

      next();
    } catch (err: any) {
      // Nếu Redis tạm thời mất kết nối, tự động chuyển tiếp xuống Database
      next();
    }
  };
};

/**
 * Hàm xóa cache an toàn khi dữ liệu thay đổi (Import Excel, Sửa, Xóa)
 * Sử dụng SCAN để không làm nghẽn đơn luồng của Redis
 */
export const clearCachePattern = async (pattern: string) => {
  try {
    const stream = redis.scanStream({
      match: pattern,
      count: 100,
    });

    const keysToDelete: string[] = [];

    stream.on('data', (resultKeys: string[]) => {
      for (const key of resultKeys) {
        keysToDelete.push(key);
      }
    });

    stream.on('end', async () => {
      if (keysToDelete.length > 0) {
        await redis.del(...keysToDelete);
        console.log(`🧹 [Cache CLEARED] Đã dọn dẹp ${keysToDelete.length} keys (${pattern})`);
      }
    });
  } catch (error: any) {
    console.error('❌ Lỗi xóa cache:', error.message);
  }
};