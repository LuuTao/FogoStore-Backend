import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import { prisma } from './prisma';
import { getJwtSecret, JWT_AUDIENCE, JWT_ISSUER } from './authConfig';

type SessionUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  role: 'CUSTOMER' | 'ADMIN';
};

export const ACCESS_COOKIE_NAME = 'fogo_access';
export const REFRESH_COOKIE_NAME = 'fogo_refresh';
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export const readCookie = (req: Request, name: string): string | null => {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
};

const sameSite = (): 'lax' | 'strict' | 'none' => {
  const configured = process.env.AUTH_COOKIE_SAME_SITE?.toLowerCase();
  if (configured === 'lax' || configured === 'strict' || configured === 'none') return configured;
  return 'lax';
};

const cookieBase = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: sameSite(),
  partitioned: process.env.NODE_ENV === 'production' && process.env.AUTH_COOKIE_PARTITIONED === 'true',
  path: '/',
} as const);

const clientIp = (req: Request) =>
  (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || undefined;

const signAccessToken = (user: SessionUser, sessionId: string) =>
  jwt.sign(
    { id: user.id, email: user.email, phone: user.phone, role: user.role, sid: sessionId },
    getJwtSecret(),
    {
      algorithm: 'HS256',
      expiresIn: ACCESS_TTL_SECONDS,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );

const setCookies = (res: Response, accessToken: string, refreshToken: string) => {
  res.cookie(ACCESS_COOKIE_NAME, accessToken, { ...cookieBase(), maxAge: ACCESS_TTL_SECONDS * 1000 });
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, { ...cookieBase(), maxAge: REFRESH_TTL_SECONDS * 1000 });
};

export const clearAuthCookies = (res: Response) => {
  res.clearCookie(ACCESS_COOKIE_NAME, cookieBase());
  res.clearCookie(REFRESH_COOKIE_NAME, cookieBase());
};

export const issueAuthSession = async (
  user: SessionUser,
  req: Request,
  res: Response
) => {
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
      ip: clientIp(req),
      userAgent: req.headers['user-agent']?.slice(0, 1000),
    },
  });
  const accessToken = signAccessToken(user, session.id);
  setCookies(res, accessToken, refreshToken);
  return { sessionId: session.id };
};

export const rotateAuthSession = async (req: Request, res: Response) => {
  const refreshToken = readCookie(req, REFRESH_COOKIE_NAME);
  if (!refreshToken) return null;

  const current = await prisma.authSession.findUnique({
    where: { refreshTokenHash: hashToken(refreshToken) },
    include: { user: true },
  });
  if (!current || current.revokedAt || current.expiresAt <= new Date()) return null;

  const nextRefreshToken = crypto.randomBytes(48).toString('base64url');
  const updated = await prisma.authSession.updateMany({
    where: { id: current.id, revokedAt: null, refreshTokenHash: hashToken(refreshToken) },
    data: {
      refreshTokenHash: hashToken(nextRefreshToken),
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
      ip: clientIp(req),
      userAgent: req.headers['user-agent']?.slice(0, 1000),
    },
  });
  if (updated.count !== 1) return null;

  const accessToken = signAccessToken(current.user as SessionUser, current.id);
  setCookies(res, accessToken, nextRefreshToken);
  return current.user;
};

export const revokeCurrentSession = async (req: Request) => {
  const refreshToken = readCookie(req, REFRESH_COOKIE_NAME);
  if (refreshToken) {
    await prisma.authSession.updateMany({
      where: { refreshTokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return;
  }

  const accessToken = readCookie(req, ACCESS_COOKIE_NAME);
  if (!accessToken) return;
  try {
    const decoded = jwt.verify(accessToken, getJwtSecret(), {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as jwt.JwtPayload;
    if (typeof decoded.sid === 'string') {
      await prisma.authSession.updateMany({
        where: { id: decoded.sid, userId: String(decoded.id || ''), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  } catch {
    // Cookie hết hạn/không hợp lệ vẫn được xóa ở response logout.
  }
};

export const revokeAllUserSessions = async (userId: string) => {
  await prisma.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

export const isAccessSessionActive = async (sessionId: string, userId: string) => {
  const session = await prisma.authSession.findFirst({
    where: {
      id: sessionId,
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return Boolean(session);
};
