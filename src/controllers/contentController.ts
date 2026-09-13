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
    const banners = await prisma.banner.findMany({
      orderBy: { order: 'asc' },
    });

    // Map dữ liệu để tương thích cả 2 cách gọi trường của frontend
    const mapped = banners.map((b) => ({
      id: b.id,
      title: b.title,
      name: b.title,
      imageUrl: b.imageUrl,
      link: b.linkUrl || '/',
      linkUrl: b.linkUrl || '/',
      group: b.position,
      position: b.position,
      active: b.isActive,
      isActive: b.isActive,
      order: b.order,
      createdAt: b.createdAt,
    }));

    return res.json({ success: true, data: mapped });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const syncBanners = async (req: Request, res: Response) => {
  try {
    const rawItems = Array.isArray(req.body) ? req.body : req.body?.items;

    if (!Array.isArray(rawItems)) {
      return res.status(400).json({ success: false, error: 'Dữ liệu không hợp lệ (cần danh sách banner)' });
    }

    const sanitizedItems = rawItems.map((it: any, index: number) => {
      let rawUrl = String(it.imageUrl || '');
      if (rawUrl.includes('/uploads/')) {
        rawUrl = '/uploads/' + rawUrl.split('/uploads/').pop();
      }

      return {
        title: String(it.name || it.title || 'Banner Fogo'),
        imageUrl: rawUrl,
        linkUrl: String(it.linkUrl || it.link || '/'),
        position: String(it.position || it.group || 'HOME_TOP'),
        isActive: it.isActive !== undefined ? Boolean(it.isActive) : (it.active !== false),
        order: Number(it.order ?? index),
      };
    });

    // Xóa toàn bộ và cập nhật đồng bộ lại vào DB
    await prisma.$transaction([
      prisma.banner.deleteMany({}),
      prisma.banner.createMany({
        data: sanitizedItems,
      }),
    ]);

    const updated = await prisma.banner.findMany({ orderBy: { order: 'asc' } });
    return res.json({
      success: true,
      message: 'Đã lưu cấu hình banner vào Database thành công!',
      data: updated,
    });
  } catch (error: any) {
    console.error('Lỗi syncBanners:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};