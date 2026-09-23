import { Request, Response } from 'express';
import fs from 'fs';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { prisma } from '../lib/prisma';

// ==========================================
// BANNER MANAGEMENT
// ==========================================
export const getBanners = async (req: Request, res: Response) => {
  try {
    const banners = await prisma.banner.findMany({
      orderBy: { order: 'asc' },
    });

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

// ==========================================
// POSTS CRUD MANAGEMENT
// ==========================================
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

export const deletePost = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.post.delete({ where: { id: String(id) } });
    return res.json({ success: true, message: 'Đã xóa bài viết thành công!' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

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

// ==========================================
// IMPORT POSTS (EXCEL, CSV, WORD .DOCX)
// ==========================================
export const importPostsFromFile = async (req: any, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Chưa đính kèm file (.xlsx, .csv, .docx)!' });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname.toLowerCase();
    let importedCount = 0;

    // 1. FILE WORD (.DOCX)
    if (originalName.endsWith('.docx')) {
      const result = await mammoth.convertToHtml({ path: filePath });
      const htmlContent = result.value;

      const rawTitle = req.file.originalname.replace(/\.docx$/i, '').trim();
      const cleanSlug = rawTitle
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const plainText = htmlContent.replace(/<[^>]+>/g, ' ').trim();
      const summary = plainText.slice(0, 180) + (plainText.length > 180 ? '...' : '');

      await prisma.post.create({
        data: {
          title: rawTitle,
          slug: `${cleanSlug}-${Date.now().toString().slice(-4)}`,
          content: htmlContent,
          summary,
        },
      });

      importedCount = 1;
    } 
    // 2. FILE EXCEL / CSV (.XLSX, .XLS, .CSV)
    else if (originalName.endsWith('.xlsx') || originalName.endsWith('.xls') || originalName.endsWith('.csv')) {
      const workbook = new ExcelJS.Workbook();
      if (originalName.endsWith('.csv')) {
        await workbook.csv.readFile(filePath);
      } else {
        await workbook.xlsx.readFile(filePath);
      }

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error('File không chứa trang dữ liệu!');
      }

      const headers: Record<number, string> = {};
      worksheet.getRow(1).eachCell((cell, col) => {
        headers[col] = cell.value?.toString().trim() || '';
      });

      for (let r = 2; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r);
        if (!row.hasValues) continue;

        const rowData: Record<string, any> = {};
        row.eachCell((cell, col) => {
          if (headers[col]) rowData[headers[col]] = cell.value;
        });

        const title = rowData['Title'] || rowData['Tiêu đề'] || rowData['Tên bài viết'];
        const rawHandle = rowData['Handle'] || rowData['Slug'] || rowData['Đường dẫn'];
        const content = rowData['Body (HTML)'] || rowData['Nội dung'] || rowData['Content'] || '';
        const summary = rowData['Summary'] || rowData['Tóm tắt'] || '';
        const thumbnail = rowData['Image Src'] || rowData['Ảnh đại diện'] || '';

        if (!title) continue;

        const cleanSlug = (rawHandle || title)
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[đĐ]/g, 'd')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');

        await prisma.post.upsert({
          where: { slug: cleanSlug },
          update: {
            title: String(title),
            content: String(content),
            summary: String(summary),
            thumbnail: String(thumbnail),
          },
          create: {
            title: String(title),
            slug: `${cleanSlug}-${Date.now().toString().slice(-4)}`,
            content: String(content),
            summary: String(summary),
            thumbnail: String(thumbnail),
          },
        });

        importedCount++;
      }
    } else {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, message: 'Định dạng file không hỗ trợ (.xlsx, .csv, .docx)!' });
    }

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    return res.json({
      success: true,
      message: `Đã nhập thành công ${importedCount} bài viết vào Database!`,
    });
  } catch (err: any) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({ success: false, message: 'Lỗi nạp file: ' + err.message });
  }
};