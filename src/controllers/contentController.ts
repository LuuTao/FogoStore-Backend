import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const getPosts = async (req: Request, res: Response) => {
  try {
    const posts = await prisma.post.findMany({ orderBy: { createdAt: 'desc' } });
    return res.json({ success: true, data: posts });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getBanners = async (req: Request, res: Response) => {
  try {
    // Lấy toàn bộ banner, không bắt buộc isActive để tránh lọc sót dữ liệu vừa tạo
    const banners = await prisma.banner.findMany({
      orderBy: { id: 'asc' },
    });
    return res.json({ success: true, data: banners });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Controller mới: Lưu toàn bộ cấu hình banner từ nút LƯU CẤU HÌNH
export const syncBanners = async (req: Request, res: Response) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'Danh sách items không hợp lệ' });
    }

    // Làm sạch link ảnh phòng trường hợp còn sót localhost
    const sanitizedItems = items.map((it: any, index: number) => ({
      title: it.name || it.title || 'Banner',
      imageUrl: String(it.imageUrl || '').replace(
        /http:\/\/localhost:[0-9]+/g,
        'https://fogo-store-api.onrender.com'
      ),
      link: it.link || '/',
      group: it.group || 'hero_banners',
      isActive: true,
      order: index,
    }));

    // Xóa danh sách cũ và chèn toàn bộ danh sách mới vào Database Neon
    await prisma.$transaction([
      prisma.banner.deleteMany({}),
      prisma.banner.createMany({
        data: sanitizedItems,
      }),
    ]);

    return res.json({ success: true, message: 'Đồng bộ banner thành công vào Database' });
  } catch (error: any) {
    console.error('Lỗi sync banner:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const syncBanners = async (req: any, res: any) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'Dữ liệu không hợp lệ' });
    }

    const sanitizedItems = items.map((it: any, index: number) => ({
      title: it.name || it.title || 'Banner',
      imageUrl: String(it.imageUrl || '').replace(
        /http:\/\/localhost:[0-9]+/g,
        'https://fogo-store-api.onrender.com'
      ),
      link: it.link || '/',
      isActive: true,
      order: index,
    }));

    await prisma.$transaction([
      prisma.banner.deleteMany({}),
      prisma.banner.createMany({
        data: sanitizedItems,
      }),
    ]);

    return res.json({ success: true, message: 'Đã lưu banner vào Database thành công!' });
  } catch (error: any) {
    console.error('Lỗi sync banner:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};