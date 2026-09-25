import { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';

interface RateLimitOptions {
  windowSeconds?: number;
  maxRequests?: number;
  freezeSeconds?: number;
}

export const slidingWindowWithFreeze = (options: RateLimitOptions = {}) => {
  const windowSeconds = options.windowSeconds || 60;
  const maxRequests = options.maxRequests || 5;
  const freezeSeconds = options.freezeSeconds || 150; // 2.5 phút

  return async (req: Request, res: Response, next: NextFunction) => {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown_ip';

    const freezeKey = `freeze:${clientIp}`;
    const rateKey = `rate:${clientIp}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;

    try {
      // Bỏ qua nếu ioredis chưa sẵn sàng để tránh làm nghẽn API
      if (redis.status !== 'ready') {
        return next();
      }

      // 1. Kiểm tra IP có bị đóng băng không
      const isFrozen = await redis.get(freezeKey);
      if (isFrozen) {
        const remainingTtl = await redis.ttl(freezeKey);
        const safeTtl = remainingTtl > 0 ? remainingTtl : freezeSeconds;
        const minutes = Math.floor(safeTtl / 60);
        const seconds = safeTtl % 60;
        const timeText = minutes > 0 ? `${minutes} phút ${seconds} giây` : `${seconds} giây`;

        return res.status(429).json({
          success: false,
          error: `Thao tác bị tạm khóa do spam yêu cầu. Vui lòng thử lại sau ${timeText}.`,
          retryAfter: safeTtl,
        });
      }

      // 2. Tăng số đếm lượt gọi
      const currentCount = await redis.incr(rateKey);
      if (currentCount === 1) {
        await redis.expire(rateKey, windowSeconds * 2);
      }

      // 3. Nếu vượt quá giới hạn -> Đóng băng 2.5 phút và ghi SecurityLog
      if (currentCount > maxRequests) {
        // Cú pháp chuẩn của ioredis: 'EX', freezeSeconds
        await redis.set(freezeKey, 'FROZEN', 'EX', freezeSeconds);
        await redis.del(rateKey);

        prisma.securityLog
          .create({
            data: {
              ip: clientIp,
              method: req.method,
              path: req.originalUrl || req.path,
              threatLevel: 'HIGH',
              eventType: 'BRUTE_FORCE',
              payload: JSON.stringify({
                reason: `Spam vượt quá ${maxRequests} request/phút`,
                count: currentCount,
                freezeSeconds,
                body: req.body ? req.body : undefined,
              }),
              userAgent: req.headers['user-agent'] || 'Unknown Agent',
            },
          })
          .catch((err) => {
            console.error('Lỗi lưu SecurityLog:', err.message);
          });

        const minutes = Math.floor(freezeSeconds / 60);
        const seconds = freezeSeconds % 60;
        const timeText = minutes > 0 ? `${minutes} phút ${seconds} giây` : `${seconds} giây`;

        return res.status(429).json({
          success: false,
          error: `Bạn đã thực hiện quá ${maxRequests} lần liên tục. Thao tác đã bị đóng băng trong ${timeText}.`,
          retryAfter: freezeSeconds,
        });
      }

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - currentCount));

      next();
    } catch {
      next();
    }
  };
};