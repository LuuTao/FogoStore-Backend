import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'fogo_secret_jwt_key_2026';
const zaloOtpStore = new Map<string, { otp: string; userData: any; expiresAt: number }>();

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

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    zaloOtpStore.set(phoneClean, { otp, userData: { phone: phoneClean, fullName, password }, expiresAt });

    console.log(`\n💬 [ZALO OTP] ${phoneClean} -> MÃ OTP: >>> ${otp} <<<\n`);
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

    const { fullName, password } = record.userData;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { phone: phoneClean, fullName, password: hashedPassword, role: 'CUSTOMER' },
    });

    zaloOtpStore.delete(phoneClean);
    const token = jwt.sign({ id: user.id, phone: user.phone, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({ success: true, data: { token, user } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { account, password } = req.body;
    const clean = account?.trim();
    const user = await prisma.user.findFirst({
      where: { OR: [{ phone: clean }, { email: clean }] },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ success: false, error: 'Tài khoản hoặc mật khẩu không chính xác' });
    }

    const token = jwt.sign({ id: user.id, phone: user.phone, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ success: true, data: { token, user } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const googleAuth = async (req: Request, res: Response) => {
  try {
    const { email, fullName } = req.body;
    const cleanEmail = email?.trim().toLowerCase();
    let user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    if (!user) {
      const randomPassword = await bcrypt.hash(`GG_${Date.now()}`, 10);
      user = await prisma.user.create({
        data: {
          email: cleanEmail,
          phone: 'GG_' + Date.now().toString().slice(-8),
          fullName: fullName || cleanEmail.split('@')[0],
          password: randomPassword,
          role: 'CUSTOMER',
        },
      });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ success: true, data: { token, user } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};