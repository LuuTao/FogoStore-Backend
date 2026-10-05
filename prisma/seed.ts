import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Bắt đầu nạp dữ liệu Admin vào PostgreSQL...');

  const adminEmail = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
  const rawPassword = process.env.ADMIN_SEED_PASSWORD;
  const adminPhone = process.env.ADMIN_SEED_PHONE?.trim();
  const adminName = process.env.ADMIN_SEED_NAME?.trim() || 'FoGo Super Admin';
  const rotateExistingPassword = process.env.ADMIN_SEED_ROTATE_PASSWORD === 'true';

  if (!adminEmail || !rawPassword || !adminPhone) {
    throw new Error('Thiếu ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD hoặc ADMIN_SEED_PHONE. Seed đã dừng an toàn.');
  }
  if (rawPassword.length < 14) {
    throw new Error('ADMIN_SEED_PASSWORD phải có ít nhất 14 ký tự.');
  }

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    const rotatedPassword = rotateExistingPassword ? await bcrypt.hash(rawPassword, 12) : undefined;
    const adminUser = await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: 'ADMIN',
        fullName: adminName,
        ...(rotatedPassword ? { password: rotatedPassword } : {}),
      },
    });
    console.log(
      rotateExistingPassword
        ? `✅ Đã đổi mật khẩu và xác nhận quyền Admin: ${adminUser.email}`
        : `✅ Admin đã tồn tại; seed không ghi đè mật khẩu: ${adminUser.email}`
    );
    return;
  }

  const hashedPassword = await bcrypt.hash(rawPassword, 12);
  const adminUser = await prisma.user.create({
    data: {
      email: adminEmail,
      password: hashedPassword,
      fullName: adminName,
      phone: adminPhone,
      role: 'ADMIN',
    },
  });

  console.log(`✅ Đã khởi tạo Admin thành công: ${adminUser.email}`);
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi chạy seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
