import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import nodemailer from 'nodemailer';

const JWT_SECRET = process.env.JWT_SECRET || 'fogo_secret_jwt_key_2026';

// Cấu hình dịch vụ gửi thư Gmail (miễn phí qua App Password)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Bộ nhớ đệm tạm lưu OTP theo Email (thời hạn 5 phút)
const emailOtpStore = new Map<string, { otp: string; userData: any; expiresAt: number }>();
const zaloOtpStore = new Map<string, { otp: string; userData: any; expiresAt: number }>();

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

    // Kiểm tra xem Email hoặc Số điện thoại đã tồn tại chưa
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

    // Tạo mã ngẫu nhiên 6 số và đặt hạn 5 phút
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    emailOtpStore.set(emailClean, {
      otp,
      userData: { email: emailClean, phone: phoneClean, fullName, password },
      expiresAt,
    });

    // In mã ra Terminal để test nhanh không cần mở hộp thư
    console.log(`\n📧 [GMAIL OTP] ${emailClean} -> MÃ OTP: >>> ${otp} <<<\n`);

    // Gửi email thực tế qua tài khoản Gmail
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

    const { fullName, phone, password } = record.userData;
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: emailClean,
        phone,
        fullName,
        password: hashedPassword,
        role: 'CUSTOMER',
      },
    });

    emailOtpStore.delete(emailClean);

    const token = jwt.sign(
      { id: user.id, email: user.email, phone: user.phone, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({ success: true, data: { token, user } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 3. CÁC HÀM CŨ (ZALO, LOGIN, GOOGLE AUTH)
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