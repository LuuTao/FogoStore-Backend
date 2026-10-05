import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { ACCESS_COOKIE_NAME, isAccessSessionActive, readCookie } from './authSession';
export { getJwtSecret, JWT_AUDIENCE, JWT_ISSUER } from './authConfig';
import { getJwtSecret, JWT_AUDIENCE, JWT_ISSUER } from './authConfig';

export interface AuthenticatedUser extends JwtPayload {
  id: string;
  email?: string;
  phone?: string;
  role: 'CUSTOMER' | 'ADMIN';
  sid: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

const readBearerToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
};

const readAccessToken = (req: Request): string | null => readBearerToken(req) || readCookie(req, ACCESS_COOKIE_NAME);

const verifyToken = (token: string): AuthenticatedUser => {
  const decoded = jwt.verify(token, getJwtSecret(), {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  if (
    typeof decoded === 'string' ||
    !decoded.id ||
    (decoded.role !== 'CUSTOMER' && decoded.role !== 'ADMIN') ||
    typeof decoded.sid !== 'string' ||
    !decoded.sid
  ) {
    throw new Error('Token thiếu thông tin định danh hợp lệ.');
  }
  return decoded as AuthenticatedUser;
};

const authenticate = async (req: AuthenticatedRequest, token: string) => {
  const user = verifyToken(token);
  if (!(await isAccessSessionActive(user.sid, user.id))) {
    throw new Error('Phiên đã bị thu hồi.');
  }
  req.user = user;
  return user;
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const token = readAccessToken(req);
  if (!token) return next();

  try {
    await authenticate(req, token);
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }
};

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const token = readAccessToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Bạn cần đăng nhập để tiếp tục.' });
  }

  try {
    await authenticate(req, token);
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }
};

export const verifyAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const token = readAccessToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Chưa đăng nhập quản trị.' });
  }

  try {
    const decoded = await authenticate(req, token);
    if (decoded.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Tài khoản không có quyền quản trị.' });
    }
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Phiên quản trị không hợp lệ hoặc đã hết hạn.' });
  }
};
