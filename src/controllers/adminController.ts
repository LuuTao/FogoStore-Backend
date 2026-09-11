import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import fs from 'fs';
import { prisma } from '../lib/prisma';

// 1. Tồn kho
export const getInventory = async (req: Request, res: Response) => {
  try {
    const variants = await prisma.productVariant.findMany({
      include: {
        product: {
          include: { category: true },
        },
      },
      orderBy: { stock: 'asc' },
    });
    return res.json({ success: true, data: variants });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// 2. Tạo sản phẩm đầy đủ kèm biến thể
export const createFullProduct = async (req: Request, res: Response) => {
  try {
    const { name, categoryName, description, isFeatured, isFlashSale, isHot, variants } = req.body;

    if (!name || !categoryName || !variants || variants.length === 0) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập tên sản phẩm, danh mục và ít nhất 1 biến thể' });
    }

    let cat = await prisma.category.findFirst({ where: { name: categoryName } });
    if (!cat) {
      cat = await prisma.category.create({
        data: {
          name: categoryName,
          slug: categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        },
      });
    }

    const cleanSlug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const newProduct = await prisma.product.create({
      data: {
        name,
        slug: `${cleanSlug}-${Date.now().toString().slice(-4)}`,
        description: description || `Mô tả chính hãng của ${name}`,
        categoryId: cat.id,
        isFeatured: Boolean(isFeatured),
        isFlashSale: Boolean(isFlashSale),
        isHot: Boolean(isHot),
        variants: {
          create: variants.map((v: any) => ({
            storage: v.storage,
            color: v.color,
            slug: `${v.storage.toLowerCase()}-${v.color.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-3)}`,
            price: Number(v.price),
            originalPrice: Number(v.originalPrice || v.price),
            stock: Number(v.stock || 0),
            images: v.imageUrl ? [v.imageUrl] : [],
          })),
        },
      },
      include: { variants: true, category: true },
    });

    return res.status(201).json({ success: true, data: newProduct });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// 3. Xóa sản phẩm gốc
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    await prisma.productVariant.deleteMany({ where: { productId: req.params.id } });
    await prisma.product.delete({ where: { id: req.params.id } });
    return res.json({ success: true, message: 'Đã xóa toàn bộ sản phẩm thành công' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 4. Thêm biến thể cho sản phẩm sẵn có
export const addVariant = async (req: Request, res: Response) => {
  try {
    const { productId, storage, color, price, originalPrice, stock, imageUrl } = req.body;
    if (!productId || !storage || !color || !price) {
      return res.status(400).json({ success: false, error: 'Vui lòng điền đủ thông tin bắt buộc' });
    }

    const variantSlug = `${storage.toLowerCase()}-${color.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`;

    const newVariant = await prisma.productVariant.create({
      data: {
        productId,
        storage,
        color,
        slug: variantSlug,
        price: Number(price),
        originalPrice: Number(originalPrice || price),
        stock: Number(stock || 0),
        images: imageUrl ? [imageUrl] : [],
      },
      include: { product: { include: { category: true } } },
    });

    return res.status(201).json({ success: true, data: newVariant });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// 5. Cập nhật biến thể (Hỗ trợ String[] images an toàn)
export const updateVariant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { storage, color, price, originalPrice, stock, images } = req.body;

    let formattedImages: string[] = [];
    if (Array.isArray(images)) {
      formattedImages = images.filter((img) => typeof img === 'string' && img.trim() !== '');
    } else if (typeof images === 'string') {
      try {
        const parsed = JSON.parse(images);
        formattedImages = Array.isArray(parsed) ? parsed : [images];
      } catch {
        formattedImages = [images];
      }
    }

    const updated = await prisma.productVariant.update({
      where: { id },
      data: {
        ...(storage && { storage }),
        ...(color && { color }),
        ...(price !== undefined && { price: Number(price) }),
        ...(originalPrice !== undefined && { originalPrice: Number(originalPrice) }),
        ...(stock !== undefined && { stock: Number(stock) }),
        ...(formattedImages.length > 0 && { images: formattedImages }),
      },
    });

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Lỗi cập nhật biến thể:', error);
    return res.status(500).json({ success: false, error: 'Lỗi cập nhật biến thể' });
  }
};

// 6. Cập nhật nhanh tồn kho (PATCH)
export const patchVariant = async (req: Request, res: Response) => {
  try {
    const { stock, price } = req.body;
    const updated = await prisma.productVariant.update({
      where: { id: req.params.variantId },
      data: {
        ...(stock !== undefined && { stock: Number(stock) }),
        ...(price !== undefined && { price: Number(price) }),
      },
    });
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// 7. Xóa biến thể lẻ
export const deleteVariant = async (req: Request, res: Response) => {
  try {
    await prisma.productVariant.delete({ where: { id: req.params.variantId } });
    return res.json({ success: true, message: 'Đã xóa biến thể thành công' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// 8. Import sản phẩm từ Excel
export const importExcel = async (req: any, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Chưa đính kèm file Excel' });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return res.status(400).json({ success: false, error: 'File không có dữ liệu' });

    const headers: { [colNumber: number]: string } = {};
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber] = cell.value ? cell.value.toString().trim() : '';
    });

    let count = 0;
    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      if (!row.hasValues) continue;
      const d: any = {};
      row.eachCell((cell, colNumber) => {
        const h = headers[colNumber];
        if (h) {
          const val = cell.value;
          d[h] = typeof val === 'object' && val !== null && 'result' in val ? (val as any).result : val;
        }
      });

      const name = d['Tên'] || d['name'];
      const catName = d['Danh Mục'] || d['category'] || 'iPhone';
      const storage = d['Dung Lượng'] || d['storage'] || '128GB';
      const color = d['Màu Sắc'] || d['color'] || 'Đen';
      const price = Number(d['Giá Bán'] || d['price'] || 0);
      const originalPrice = Number(d['Giá Gốc'] || d['originalPrice'] || price);
      const stock = Number(d['Tồn Kho'] || d['stock'] || 10);
      const imageUrl = d['Ảnh'] || d['imageUrl'] || '';

      if (!name || !price) continue;

      let cat = await prisma.category.findFirst({ where: { name: catName } });
      if (!cat) {
        cat = await prisma.category.create({
          data: { name: catName, slug: catName.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
        });
      }

      const cleanSlug = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const variantSlug = `${storage.toLowerCase()}-${color.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/[^a-z0-9]+/g, '-')}`;

      let prod = await prisma.product.findUnique({ where: { slug: cleanSlug } });
      if (!prod) {
        prod = await prisma.product.create({
          data: {
            name,
            slug: cleanSlug,
            categoryId: cat.id,
            description: `Mô tả chính hãng của ${name}`,
          },
        });
      }

      const existingVariant = await prisma.productVariant.findFirst({
        where: { productId: prod.id, slug: variantSlug },
      });

      if (existingVariant) {
        await prisma.productVariant.update({
          where: { id: existingVariant.id },
          data: {
            price,
            originalPrice,
            stock,
            images: imageUrl ? [imageUrl] : existingVariant.images,
          },
        });
      } else {
        await prisma.productVariant.create({
          data: {
            productId: prod.id,
            storage,
            color,
            slug: variantSlug,
            price,
            originalPrice,
            stock,
            images: imageUrl ? [imageUrl] : [],
          },
        });
      }
      count++;
    }

    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    return res.json({ success: true, message: `Nhập thành công ${count} cấu hình sản phẩm từ file Excel!` });
  } catch (err: any) {
    console.error('Lỗi Import Excel:', err);
    return res.status(500).json({ success: false, error: 'Lỗi xử lý file Excel: ' + err.message });
  }
};

// 9. Thống kê Analytics
export const getAnalytics = async (req: Request, res: Response) => {
  try {
    const completedOrders = await prisma.order.findMany({
      where: { OR: [{ orderStatus: 'COMPLETED' }, { paymentStatus: 'PAID' }] },
    });
    const totalRevenue = completedOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalOrders = await prisma.order.count();
    const totalProducts = await prisma.product.count();
    const topSelling = await prisma.product.findMany({ take: 5, orderBy: { soldQuantity: 'desc' } });

    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    const revenueByDay = await Promise.all(
      last7Days.map(async (day) => {
        const start = new Date(`${day}T00:00:00.000Z`);
        const end = new Date(`${day}T23:59:59.999Z`);
        const orders = await prisma.order.findMany({
          where: { createdAt: { gte: start, lte: end }, OR: [{ orderStatus: 'COMPLETED' }, { paymentStatus: 'PAID' }] },
        });
        return { date: day, total: orders.reduce((s, o) => s + o.totalAmount, 0), ordersCount: orders.length };
      })
    );

    return res.json({ success: true, data: { totalRevenue, totalOrders, totalProducts, topSelling, revenueByDay } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// 10. Quản lý Đơn hàng cho Admin
export const getAdminOrders = async (req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({ include: { items: true }, orderBy: { createdAt: 'desc' } });
    return res.json({ success: true, data: orders });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { orderStatus, paymentStatus } = req.body;
    const updated = await prisma.order.update({
      where: { id: req.params.id },
      data: { ...(orderStatus && { orderStatus }), ...(paymentStatus && { paymentStatus }) },
    });
    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 11. Import bài viết Haravan
export const importHaravanPosts = async (req: any, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Chưa đính kèm file Haravan' });
    const workbook = new ExcelJS.Workbook();
    if (req.file.originalname.endsWith('.csv')) await workbook.csv.readFile(req.file.path);
    else await workbook.xlsx.readFile(req.file.path);

    const worksheet = workbook.worksheets[0];
    const headers: any = {};
    worksheet.getRow(1).eachCell((cell, col) => { headers[col] = cell.value?.toString().trim(); });

    let count = 0;
    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      if (!row.hasValues) continue;
      const d: any = {};
      row.eachCell((cell, col) => { if (headers[col]) d[headers[col]] = cell.value; });

      const title = d['Title'] || d['Tiêu đề'] || d['Tên bài viết'];
      const rawHandle = d['Handle'] || d['Slug'] || d['Đường dẫn'];
      const content = d['Body (HTML)'] || d['Nội dung'] || d['Content'];
      const summary = d['Summary'] || d['Tóm tắt'] || '';
      const thumbnail = d['Image Src'] || d['Ảnh đại diện'] || '';

      if (!title) continue;
      const cleanSlug = (rawHandle || title).toLowerCase().replace(/[^a-z0-9]+/g, '-');

      await prisma.post.upsert({
        where: { slug: cleanSlug },
        update: { title, content: content || '', summary, thumbnail },
        create: { title, slug: cleanSlug, content: content || '', summary, thumbnail },
      });
      count++;
    }

    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.json({ success: true, message: `Đã nhập thành công ${count} bài viết từ Haravan!` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// 12. Quản lý Banners
export const createBannersBulk = async (req: Request, res: Response) => {
  try {
    const { banners } = req.body;
    const created = await prisma.$transaction(
      banners.map((b: any, i: number) =>
        prisma.banner.create({
          data: {
            title: b.title || `Banner ${i + 1}`,
            imageUrl: b.imageUrl,
            linkUrl: b.linkUrl || '/',
            position: b.position || 'HOME_TOP',
            order: Number(b.order ?? i),
          },
        })
      )
    );
    return res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteBanner = async (req: Request, res: Response) => {
  await prisma.banner.delete({ where: { id: req.params.id } });
  return res.json({ success: true, message: 'Đã xóa banner' });
};