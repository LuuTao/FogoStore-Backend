import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

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

// 1. Lấy danh sách bài viết
export const getPosts = async (req: Request, res: Response) => {
  try {
    const posts = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: posts });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 2. Thêm bài viết mới
export const createPost = async (req: Request, res: Response) => {
  try {
    const { title, slug, summary, content, thumbnail } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'Tiêu đề bài viết không được để trống' });
    }

    const cleanSlug = (slug || title)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const newPost = await prisma.post.create({
      data: {
        title,
        slug: `${cleanSlug}-${Date.now().toString().slice(-4)}`,
        summary: summary || '',
        content: content || '',
        thumbnail: thumbnail || '',
      },
    });

    return res.status(201).json({ success: true, data: newPost, message: 'Tạo bài viết thành công!' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 3. Cập nhật bài viết
export const updatePost = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, slug, summary, content, thumbnail } = req.body;

    const updated = await prisma.post.update({
      where: { id: String(id) },
      data: {
        ...(title && { title }),
        ...(slug && { slug }),
        ...(summary !== undefined && { summary }),
        ...(content !== undefined && { content }),
        ...(thumbnail !== undefined && { thumbnail }),
      },
    });

    return res.json({ success: true, data: updated, message: 'Cập nhật bài viết thành công!' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 4. Xóa một bài viết
export const deletePost = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.post.delete({ where: { id: String(id) } });
    return res.json({ success: true, message: 'Đã xóa bài viết thành công!' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 5. Xóa nhiều bài viết hàng loạt
export const deletePostsBulk = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất 1 bài viết để xóa' });
    }

    const result = await prisma.post.deleteMany({
      where: { id: { in: ids } },
    });

    return res.json({ success: true, message: `Đã xóa thành công ${result.count} bài viết!` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};