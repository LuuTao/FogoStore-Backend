"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Bắt đầu nạp dữ liệu Admin vào PostgreSQL...');
    const adminEmail = 'fogo_admin@gmail.com';
    const rawPassword = 'Fogo@#Store';
    const hashedPassword = await bcryptjs_1.default.hash(rawPassword, 10);
    const adminUser = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {
            password: hashedPassword,
            role: 'ADMIN',
            fullName: 'FoGo Super Admin',
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
