import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { redis } from '../lib/redis';

type Alert = {
  eventType: string;
  threatLevel: string;
  ip: string;
  method: string;
  path: string;
  userAgent?: string;
};

const recipient = process.env.SECURITY_ALERT_EMAIL || process.env.SECURITY_LOG_EMAIL;

export const sendSecurityAlert = async (alert: Alert) => {
  if (!recipient || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
  const fingerprint = crypto
    .createHash('sha256')
    .update(`${alert.eventType}|${alert.ip}|${alert.path}`)
    .digest('hex')
    .slice(0, 24);

  // Mỗi loại cảnh báo/IP/đường dẫn chỉ gửi tối đa một email trong 10 phút.
  const acquired = await redis.set(`security-alert:${fingerprint}`, '1', { nx: true, ex: 600 });
  if (!acquired) return;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  await transporter.sendMail({
    from: `"FoGo Security" <${process.env.EMAIL_USER}>`,
    to: recipient,
    subject: `[FoGo ${alert.threatLevel}] ${alert.eventType}`,
    text: [
      `Sự kiện: ${alert.eventType}`,
      `Mức độ: ${alert.threatLevel}`,
      `IP: ${alert.ip}`,
      `Request: ${alert.method} ${alert.path}`,
      `Thiết bị: ${(alert.userAgent || 'Không rõ').slice(0, 500)}`,
      'Chi tiết đầy đủ có trong trang Bảo Mật & Log Nguy Cơ.',
    ].join('\n'),
  });
};
