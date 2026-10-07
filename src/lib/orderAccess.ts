import crypto from 'crypto';
import { Request, Response } from 'express';
import type { AuthenticatedRequest } from './authMiddleware';
import { readCookie } from './authSession';

type ProtectedOrder = {
  userId?: string | null;
  accessTokenHash?: string | null;
  orderCode?: string | null;
};

export const createOrderAccessToken = () => crypto.randomBytes(32).toString('base64url');

export const hashOrderAccessToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

const constantTimeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const orderCookieName = (orderCode: unknown) =>
  `fogo_order_${crypto.createHash('sha256').update(String(orderCode || '')).digest('hex').slice(0, 20)}`;

const orderCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: (process.env.AUTH_COOKIE_SAME_SITE === 'none' ? 'none' : 'lax') as 'none' | 'lax',
  partitioned: process.env.NODE_ENV === 'production' && process.env.AUTH_COOKIE_PARTITIONED === 'true',
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/api/orders',
} as const);

export const setOrderAccessCookie = (res: Response, orderCode: string, token: string) => {
  res.cookie(orderCookieName(orderCode), token, orderCookieOptions());
};

export const readOrderAccessToken = (req: Request, orderCode: unknown) =>
  readCookie(req, orderCookieName(orderCode));

export const canAccessOrder = (req: AuthenticatedRequest, order: ProtectedOrder) => {
  if (req.user?.role === 'ADMIN') return true;

  // Đơn đã gắn với tài khoản chỉ chủ tài khoản đó mới được truy cập.
  // Không chấp nhận token hoặc số điện thoại để mở đơn của tài khoản khác.
  if (order.userId) {
    return Boolean(req.user?.id && req.user.id === order.userId);
  }

  // Đơn guest không có tài khoản chỉ được mở bằng token bí mật được cấp
  // cho đúng trình duyệt tại thời điểm tạo đơn.
  const suppliedToken = String(
    req.headers['x-order-token'] || readOrderAccessToken(req, order.orderCode) || ''
  ).trim();
  if (suppliedToken && order.accessTokenHash) {
    return constantTimeEqual(hashOrderAccessToken(suppliedToken), order.accessTokenHash);
  }

  return false;
};

export const rejectOrderAccess = (res: Response) =>
  res.status(404).json({
    success: false,
    error: 'Không tìm thấy đơn hàng hoặc thông tin xác minh không hợp lệ.',
  });
