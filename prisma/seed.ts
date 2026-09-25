import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Bắt đầu nạp dữ liệu Admin vào PostgreSQL...');

  const adminEmail = 'fogo_admin@gmail.com';
  const rawPassword = 'Fogo@#Store';
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      password: hashedPassword,
      role: 'ADMIN',
      fullName: 'Fogo Admin',
    },
    create: {
      email: adminEmail,
      password: hashedPassword,
      fullName: 'FoGo Super Admin',
      phone: '0566003333',
      role: 'ADMIN',
    },
  });

  console.log(`✅ Đã khởi tạo/cập nhật Admin thành công: ${adminUser.email}`);
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi chạy seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });