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
    // Luôn lấy toàn bộ banner theo thứ tự order
    const banners = await prisma.banner.findMany({
      orderBy: { order: 'asc' },
    });
    return res.json({ success: true, data: banners });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const syncBanners = async (req: Request, res: Response) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'Dữ liệu không hợp lệ' });
    }

    const sanitizedItems = items.map((it: any, index: number) => {
      let rawUrl = String(it.imageUrl || '');
      if (rawUrl.includes('/uploads/')) {
        rawUrl = '/uploads/' + rawUrl.split('/uploads/').pop();
      }

      return {
        title: it.name || it.title || 'Banner',
        imageUrl: rawUrl,
        link: it.link || '/',
        group: it.group || 'hero_banners',
        isActive: true,
        order: index,
      };
    });

    await prisma.$transaction([
      prisma.banner.deleteMany({}),
      prisma.banner.createMany({
        data: sanitizedItems,
      }),
    ]);

    return res.json({ success: true, message: 'Đã lưu cấu hình banner vào Database thành công!' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};