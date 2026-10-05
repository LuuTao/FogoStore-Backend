import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import nodemailer from 'nodemailer';
import { OAuth2Client } from 'google-auth-library';
import {
  clearAuthCookies,
  issueAuthSession,
  revokeAllUserSessions,
  revokeCurrentSession,
  rotateAuthSession,
} from '../lib/authSession';
import { getMembershipStats } from '../services/membershipService';

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  '974988535391-m1b2907pue0m80ek7a5vuvl0idkk2787.apps.googleusercontent.com';

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const emailOtpStore = new Map<string, { otp: string; userData: any; expiresAt: number }>();
const zaloOtpStore = new Map<string, { otp: string; userData: any; expiresAt: number }>();

const otpCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of emailOtpStore) if (record.expiresAt <= now) emailOtpStore.delete(key);
  for (const [key, record] of zaloOtpStore) if (record.expiresAt <= now) zaloOtpStore.delete(key);
}, 60_000);
otpCleanupTimer.unref();

const publicUser = (user: any) => {
  const { password: _password, ...safeUser } = user;
  return safeUser;
};

// ==========================================
// 1. GỬI MÃ OTP VỀ HÒM THƯ GMAIL (MIỄN PHÍ)
// ==========================================
export const sendEmailOtp = async (req: Request, res: Response) => {
  try {
    const { email, phone, fullName, password } = req.body;
    if (!email || !phone || !fullName || !password) {
      return res.status(400).json({
        success: false,
        error: 'Vui lòng nhập đầy đủ Họ tên, Email, Số điện thoại và Mật khẩu',
      });
    }

    const emailClean = email.trim().toLowerCase();
    const phoneClean = phone.trim().replace(/\s+/g, '');

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: emailClean }, { phone: phoneClean }],
      },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error:
          existingUser.email === emailClean
            ? 'Địa chỉ Email này đã được sử dụng'
            : 'Số điện thoại này đã được sử dụng',
      });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    const passwordHash = await bcrypt.hash(password, 12);

    emailOtpStore.set(emailClean, {
      otp,
      userData: { email: emailClean, phone: phoneClean, fullName, passwordHash },
      expiresAt,
    });

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      await transporter.sendMail({
        from: `"Fogo Store" <${process.env.EMAIL_USER}>`,
        to: emailClean,
        subject: 'Mã xác thực đăng ký tài khoản - Fogo Store',
        html: `
          <div style="max-width: 520px; margin: 0 auto; font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; border: 1px solid #f0f0f0; border-radius: 12px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="color: #d70018; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: 1px;">FOGO STORE</h1>
              <p style="color: #666; font-size: 13px; margin-top: 4px;">The Best Apple Retail Store in HCM</p>
            </div>
            <p style="font-size: 14px; color: #333;">Xin chào <b>${fullName}</b>,</p>
            <p style="font-size: 14px; color: #555; line-height: 1.5;">Bạn đang thực hiện đăng ký tài khoản tại Fogo Store. Dưới đây là mã xác thực OTP của bạn:</p>
            <div style="background-color: #fff1f2; border: 1px dashed #d70018; padding: 16px; border-radius: 8px; text-align: center; margin: 24px 0;">
              <span style="font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #d70018;">${otp}</span>
            </div>
            <p style="color: #888; font-size: 12px; line-height: 1.4;">* Mã này có hiệu lực trong vòng <b>5 phút</b>. Vui lòng không chia sẻ mã này cho bất kỳ ai để bảo vệ tài khoản.</p>
          </div>
        `,
      });
    }

    return res.json({
      success: true,
      message: `Mã OTP đã được gửi đến hòm thư ${emailClean}`,
    });
  } catch (error: any) {
    console.error('Lỗi sendEmailOtp:', error);
    return res.status(500).json({ success: false, error: 'Không thể gửi email xác thực' });
  }
};

// ==========================================
// 2. XÁC THỰC OTP GMAIL & TẠO TÀI KHOẢN
// ==========================================
export const verifyEmailOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;
    const emailClean = email?.trim().toLowerCase();
    const record = emailOtpStore.get(emailClean);

    if (!record || Date.now() > record.expiresAt || record.otp !== otp?.trim()) {
      return res.status(400).json({ success: false, error: 'Mã OTP không chính xác hoặc đã hết hạn' });
    }

    const { fullName, phone, passwordHash } = record.userData;

    const user = await prisma.user.create({
      data: {
        email: emailClean,
        phone,
        fullName,
        password: passwordHash,
        role: 'CUSTOMER',
      },
    });

    emailOtpStore.delete(emailClean);

    await issueAuthSession(user, req, res);

    return res.status(201).json({
      success: true,
      data: {
        user: {
          ...publicUser(user),
          rank: 'MEMBER',
          totalItemsPurchased: 0,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 3. ĐĂNG NHẬP GOOGLE CHUẨN XÁC THỰC TOKEN
// ==========================================
export const googleAuth = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Thiếu Google credential token' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(401).json({ success: false, error: 'Xác thực tài khoản Google thất bại' });
    }

    const cleanEmail = payload.email.trim().toLowerCase();
    const fullName = payload.name || cleanEmail.split('@')[0];

    let user = await prisma.user.findFirst({
      where: { email: cleanEmail },
    });

    if (!user) {
      const randomPassword = await bcrypt.hash(crypto.randomBytes(48).toString('base64url'), 12);
      const uniquePhone = `GG_${Date.now().toString().slice(-6)}_${crypto.randomInt(1000, 10000)}`;

      user = await prisma.user.create({
        data: {
          email: cleanEmail,
          phone: uniquePhone,
          fullName: fullName,
          password: randomPassword,
          role: 'CUSTOMER',
        },
      });
    }

    const { totalItemsPurchased, rank } = await getMembershipStats(user.id);

    await issueAuthSession(user, req, res);

    return res.json({
      success: true,
      data: {
        user: {
          ...publicUser(user),
          totalItemsPurchased,
          rank,
        },
      },
    });
  } catch (error: any) {
    console.error('Lỗi googleAuth:', error);
    return res.status(401).json({ success: false, error: 'Token Google không hợp lệ hoặc đã hết hạn' });
  }
};

// ==========================================
// 4. ZALO OTP & ĐĂNG NHẬP THƯỜNG
// ==========================================
export const sendZaloOtp = async (req: Request, res: Response) => {
  try {
    const { phone, fullName, password } = req.body;
    if (!phone || !password || !fullName) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập đầy đủ Số điện thoại, Họ tên và Mật khẩu' });
    }
    const phoneClean = phone.trim().replace(/\s+/g, '');
    const existingUser = await prisma.user.findUnique({ where: { phone: phoneClean } });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Số điện thoại này đã được đăng ký tài khoản' });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    const passwordHash = await bcrypt.hash(password, 12);
    zaloOtpStore.set(phoneClean, { otp, userData: { phone: phoneClean, fullName, passwordHash }, expiresAt });

    return res.json({ success: true, message: `Mã OTP đã gửi về Zalo số ${phoneClean}` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyZaloOtp = async (req: Request, res: Response) => {
  try {
    const { phone, otp } = req.body;
    const phoneClean = phone?.trim().replace(/\s+/g, '');
    const record = zaloOtpStore.get(phoneClean);

    if (!record || Date.now() > record.expiresAt || record.otp !== otp?.trim()) {
      return res.status(400).json({ success: false, error: 'Mã OTP không chính xác hoặc đã hết hạn' });
    }

    const { fullName, passwordHash } = record.userData;
    const user = await prisma.user.create({
      data: { phone: phoneClean, fullName, password: passwordHash, role: 'CUSTOMER' },
    });

    zaloOtpStore.delete(phoneClean);
    await issueAuthSession(user, req, res);
    return res.status(201).json({
      success: true,
      data: {
        user: {
          ...publicUser(user),
          rank: 'MEMBER',
          totalItemsPurchased: 0,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { account, email, password } = req.body;
    const clean = (account || email)?.trim();
    if (!clean || typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập tài khoản và mật khẩu' });
    }
    const user = await prisma.user.findFirst({
      where: { OR: [{ phone: clean }, { email: clean }] },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ success: false, error: 'Tài khoản hoặc mật khẩu không chính xác' });
    }

    const { totalItemsPurchased, rank } = await getMembershipStats(user.id);

    await issueAuthSession(user, req, res);
    return res.json({
      success: true,
      data: {
        user: {
          ...publicUser(user),
          totalItemsPurchased,
          rank,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 5. LẤY THÔNG TIN HỒ SƠ & HẠNG THÀNH VIÊN
// ==========================================
export const getMe = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Chưa đăng nhập' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy thông tin người dùng' });
    }

    const { totalItemsPurchased, rank } = await getMembershipStats(user.id);

    return res.json({
      success: true,
      data: {
        ...user,
        totalItemsPurchased,
        rank,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const refreshSession = async (req: Request, res: Response) => {
  try {
    const user = await rotateAuthSession(req, res);
    if (!user) {
      clearAuthCookies(res);
      return res.status(401).json({ success: false, error: 'Phiên làm mới không hợp lệ hoặc đã hết hạn' });
    }
    return res.json({ success: true });
  } catch {
    clearAuthCookies(res);
    return res.status(401).json({ success: false, error: 'Không thể làm mới phiên đăng nhập' });
  }
};

export const logout = async (req: Request, res: Response) => {
  await revokeCurrentSession(req).catch(() => {});
  clearAuthCookies(res);
  return res.json({ success: true, message: 'Đã đăng xuất' });
};

export const logoutAllDevices = async (req: any, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ success: false, error: 'Chưa đăng nhập' });
  await revokeAllUserSessions(req.user.id);
  clearAuthCookies(res);
  return res.json({ success: true, message: 'Đã đăng xuất khỏi tất cả thiết bị' });
};
