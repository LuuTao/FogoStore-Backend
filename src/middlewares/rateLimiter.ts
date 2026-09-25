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
  const freezeSeconds = options.freezeSeconds || 150;

  return async (req: Request, res: Response, next: NextFunction) => {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown_ip';

    const freezeKey = `freeze:${clientIp}`;
    const rateKey = `rate:${clientIp}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;

    try {
      const isFrozen = await redis.get(freezeKey);
      if (isFrozen) {
        const remainingTtl = await redis.ttl(freezeKey);
        const safeTtl = remainingTtl > 0 ? remainingTtl : freezeSeconds;
        return res.status(429).json({
          success: false,
          error: `Thao tác bị tạm khóa do spam yêu cầu. Vui lòng thử lại sau ${safeTtl} giây.`,
          retryAfter: safeTtl,
        });
      }

      const currentCount = await redis.incr(rateKey);
      if (currentCount === 1) {
        await redis.expire(rateKey, windowSeconds * 2);
      }

      if (currentCount > maxRequests) {
        await redis.set(freezeKey, 'FROZEN', { ex: freezeSeconds });
        await redis.del(rateKey);

        prisma.securityLog.create({
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
            }),
            userAgent: req.headers['user-agent'] || 'Unknown Agent',
          },
        }).catch(() => {});

        return res.status(429).json({
          success: false,
          error: `Bạn đã thực hiện quá ${maxRequests} lần liên tục. Thao tác đã bị đóng băng trong 2.5 phút.`,
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