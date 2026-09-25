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
    // 1. Lấy địa chỉ IP người dùng
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown_ip';

    const freezeKey = `freeze:${clientIp}`;
    const rateKey = `rate:${clientIp}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;

    try {
      // Bỏ qua nếu Redis chưa sẵn sàng để không chặn nhầm request
      if (redis.status !== 'ready') {
        return next();
      }

      // 2. Kiểm tra IP có đang trong danh sách bị ĐÓNG BĂNG không
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

      // 3. Tăng số lượt gọi trong cửa sổ hiện tại
      const currentCount = await redis.incr(rateKey);
      if (currentCount === 1) {
        await redis.expire(rateKey, windowSeconds * 2);
      }

      // 4. Nếu vượt quá giới hạn -> Đóng băng 2.5 phút và lưu vào SecurityLog
      if (currentCount > maxRequests) {
        // Cú pháp chuẩn của ioredis: 'EX', freezeSeconds
        await redis.set(freezeKey, 'FROZEN', 'EX', freezeSeconds);
        await redis.del(rateKey);

        // Lưu cảnh báo an ninh vào cơ sở dữ liệu
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

      // Đính kèm các HTTP Header tiêu chuẩn
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - currentCount));

      next();
    } catch {
      next();
    }
  };
};