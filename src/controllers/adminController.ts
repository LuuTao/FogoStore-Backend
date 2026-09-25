import { Request, Response } from 'express';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma';

// ==========================================
// 1. LẤY TỒN KHO & BIẾN THỂ SẢN PHẨM
// ==========================================
export const getInventory = async (req: Request, res: Response) => {
  try {
    const variants = await prisma.productVariant.findMany({
      include: {
        product: {
          include: { category: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: variants });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ==========================================
// 2. TẠO SẢN PHẨM ĐẦY ĐỦ KÈM BIẾN THỂ
// ==========================================
export const createFullProduct = async (req: Request, res: Response) => {
  try {
    const { name, categoryName, description, isFeatured, isFlashSale, isHot, variants } = req.body;

    if (!name || !categoryName || !variants || variants.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Vui lòng nhập tên sản phẩm, danh mục và ít nhất 1 biến thể',
      });
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
          create: variants.map((v: any) => {
            const st = (v.storage || 'Tiêu chuẩn').toString().replace(/\//g, '-');
            const p = Number(v.price || 0);
            const s = p <= 0 ? 0 : Number(v.stock || 0);
            return {
              storage: st,
              color: v.color || 'Tiêu chuẩn',
              slug: `${st.toLowerCase()}-${(v.color || 'tc')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-3)}`,
              price: p,
              originalPrice: Number(v.originalPrice || p || 0),
              stock: s,
              images: v.imageUrl ? [v.imageUrl] : Array.isArray(v.images) ? v.images : [],
            };
          }),
        },
      },
      include: { variants: true, category: true },
    });

    return res.status(201).json({ success: true, data: newProduct });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ==========================================
// 3. XÓA SẢN PHẨM ĐƠN LẺ & HÀNG LOẠT
// ==========================================
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.productVariant.deleteMany({ where: { productId: id } });
    await prisma.product.delete({ where: { id } });
    return res.json({ success: true, message: 'Đã xóa toàn bộ sản phẩm thành công' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteProductsBulk = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Danh sách ID không hợp lệ' });
    }

    await prisma.productVariant.deleteMany({
      where: { productId: { in: ids } },
    });

    await prisma.product.deleteMany({
      where: { id: { in: ids } },
    });

    return res.json({ success: true, message: `Đã xóa thành công ${ids.length} sản phẩm!` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Lỗi khi xóa hàng loạt' });
  }
};

// ==========================================
// 4. THÊM BIẾN THỂ CHO SẢN PHẨM SẴN CÓ
// ==========================================
export const addVariant = async (req: Request, res: Response) => {
  try {
    const { productId, storage, color, price, originalPrice, stock, imageUrl } = req.body;
    if (!productId || !storage || !color) {
      return res.status(400).json({ success: false, error: 'Vui lòng điền đủ thông tin bắt buộc' });
    }

    const cleanSt = storage.toString().replace(/\//g, '-');
    const p = Number(price || 0);
    const s = p <= 0 ? 0 : Number(stock || 0);

    const variantSlug = `${cleanSt.toLowerCase()}-${color
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`;

    const newVariant = await prisma.productVariant.create({
      data: {
        productId,
        storage: cleanSt,
        color,
        slug: variantSlug,
        price: p,
        originalPrice: Number(originalPrice || p),
        stock: s,
        images: imageUrl ? [imageUrl] : [],
      },
      include: { product: { include: { category: true } } },
    });

    return res.status(201).json({ success: true, data: newVariant });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ==========================================
// 5. CẬP NHẬT BIẾN THỂ
// ==========================================
export const updateVariant = async (req: Request, res: Response) => {
  try {
    const id = (req.params.id || req.params.variantId) as string;
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

    const p = price !== undefined ? parseFloat(price) : undefined;
    const s = p !== undefined && p <= 0 ? 0 : (stock !== undefined ? parseInt(stock, 10) : undefined);

    const updated = await prisma.productVariant.update({
      where: { id },
      data: {
        ...(storage !== undefined && { storage: String(storage).replace(/\//g, '-') }),
        ...(color !== undefined && { color: String(color) }),
        ...(p !== undefined && { price: p }),
        ...(originalPrice !== undefined && { originalPrice: parseFloat(originalPrice) }),
        ...(s !== undefined && { stock: s }),
        ...(formattedImages.length > 0 && { images: formattedImages }),
      },
      include: {
        product: { include: { category: true } },
      },
    });

    return res.json({ success: true, message: 'Đã lưu cấu hình biến thể vào Database!', data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Lỗi cập nhật biến thể' });
  }
};

// ==========================================
// 6. CẬP NHẬT NHANH TỒN KHO (PATCH)
// ==========================================
export const patchVariant = async (req: Request, res: Response) => {
  try {
    const id = (req.params.variantId || req.params.id) as string;
    const { stock, price } = req.body;

    const p = price !== undefined ? Number(price) : undefined;
    const s = p !== undefined && p <= 0 ? 0 : (stock !== undefined ? Number(stock) : undefined);

    const updated = await prisma.productVariant.update({
      where: { id },
      data: {
        ...(s !== undefined && { stock: s }),
        ...(p !== undefined && { price: p }),
      },
    });
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ==========================================
// 7. XÓA BIẾN THỂ
// ==========================================
export const deleteVariant = async (req: Request, res: Response) => {
  try {
    const id = (req.params.variantId || req.params.id) as string;
    await prisma.productVariant.delete({ where: { id } });
    return res.json({ success: true, message: 'Đã xóa biến thể thành công khỏi Database' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ==========================================
// 8. IMPORT SẢN PHẨM TỰ ĐỘNG BẰNG EXCELJS (CHUẨN FILE MỚI, KHÔNG LỖI SLUG)
// ==========================================
export const importExcel = async (req: any, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'Chưa đính kèm file Excel hợp lệ' });
    }

    const workbook = new ExcelJS.Workbook();
    if (file.path) {
      await workbook.xlsx.readFile(file.path);
    } else if (file.buffer) {
      await workbook.xlsx.load(file.buffer);
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      return res.status(400).json({ success: false, error: 'File Excel rỗng hoặc không chứa dữ liệu hàng' });
    }

    // Đọc dòng tiêu đề (Header dòng 1)
    const headerMap: Record<string, number> = {};
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      const headerText = cell.value?.toString().trim() || '';
      if (headerText) {
        headerMap[headerText] = colNumber;
      }
    });

    let importedCount = 0;
    let variantCount = 0;
    const categoryCache: Record<string, string> = {};

    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      if (!row.hasValues) continue;

      const getVal = (colName: string): string => {
        const colIdx = headerMap[colName];
        if (!colIdx) return '';
        let cellVal = row.getCell(colIdx).value;
        if (cellVal === null || cellVal === undefined) return '';

        if (typeof cellVal === 'object') {
          if ('result' in cellVal) cellVal = (cellVal as any).result;
          else if ('richText' in cellVal) cellVal = (cellVal as any).richText.map((t: any) => t.text).join('');
          else if ('text' in cellVal) cellVal = (cellVal as any).text;
        }
        return String(cellVal).trim();
      };

      const productIdHaravan = Number(getVal('Mã sản phẩm') || 0);
      const variantIdHaravan = Number(getVal('Mã biến thể') || 0);
      const fullName = getVal('Tên');

      // Tự động bỏ qua dòng rác ID = 0 hoặc thiếu tên
      if (!fullName || productIdHaravan === 0 || variantIdHaravan === 0) {
        continue;
      }

      // 1. Dung lượng bộ nhớ
      const storageMatch = fullName.match(/\b(\d+\s*(?:GB|TB)(\s*\/\s*\d+\s*(?:GB|TB))?)\b/i) || fullName.match(/\b(\d+\s*mm)\b/i);
      const rawStorage = storageMatch ? storageMatch[1].replace(/\s+/g, '').toUpperCase() : 'Tiêu chuẩn';
      const storage = rawStorage.replace(/\//g, '-');

      // 2. Tên máy chính (loại bỏ dung lượng)
      const cleanName = fullName
        .replace(/\b(\d+\s*(?:GB|TB)(\s*\/\s*(?:\d+\s*)?(?:GB|TB))?)\b/gi, '')
        .replace(/\b(\d+\s*mm)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      // 3. Phân loại danh mục tự động
      const rawCategory = (getVal('Loại sản phẩm') || '').toLowerCase();
      const combinedText = `${rawCategory} ${fullName.toLowerCase()}`;
      const isUsed = combinedText.includes('cũ') || combinedText.includes('like new') || combinedText.includes('99%');

      let standardCategoryName = 'Phụ kiện';
      if (combinedText.includes('iphone')) {
        standardCategoryName = isUsed ? 'iPhone Cũ' : 'iPhone';
      } else if (combinedText.includes('macbook') || combinedText.includes('mac')) {
        standardCategoryName = isUsed ? 'MacBook Cũ' : 'MacBook';
      } else if (combinedText.includes('ipad')) {
        standardCategoryName = isUsed ? 'iPad Cũ' : 'iPad';
      } else if (combinedText.includes('watch')) {
        standardCategoryName = isUsed ? 'Watch Cũ' : 'Watch';
      }

      let categoryId = categoryCache[standardCategoryName];
      if (!categoryId) {
        let cat = await prisma.category.findFirst({ where: { name: standardCategoryName } });
        if (!cat) {
          const catSlug = standardCategoryName
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[^a-z0-9]+/g, '-');
          cat = await prisma.category.create({ data: { name: standardCategoryName, slug: catSlug } });
        }
        categoryId = cat.id;
        categoryCache[standardCategoryName] = categoryId;
      }

      // 4. Tìm hoặc tạo Sản Phẩm Cha (Product)
      const parentSlug = cleanName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      let prod = await prisma.product.findFirst({
        where: {
          OR: [
            { slug: parentSlug },
            { id: String(productIdHaravan) }
          ]
        }
      });

      const rawDescription = getVal('Mô tả');
      const descriptionContent = rawDescription || `Sản phẩm chính hãng ${cleanName} tại Fogo Store`;

      if (!prod) {
        prod = await prisma.product.create({
          data: {
            id: String(productIdHaravan),
            name: cleanName,
            slug: `${parentSlug}-${productIdHaravan.toString().slice(-4)}`,
            categoryId: categoryId,
            description: descriptionContent,
          },
        });
        importedCount++;
      } else if (rawDescription && (!prod.description || prod.description.length < 50)) {
        await prisma.product.update({
          where: { id: prod.id },
          data: { description: descriptionContent },
        });
      }

      // 5. Màu sắc (Color) từ Thuộc tính 1
      let color = '';
      const t1 = getVal('Thuộc tính 1').toLowerCase();
      const t2 = getVal('Thuộc tính 2').toLowerCase();

      if (t1.includes('color') || t1.includes('màu')) {
        color = getVal('Giá trị thuộc tính 1');
      } else if (t2.includes('color') || t2.includes('màu')) {
        color = getVal('Giá trị thuộc tính 2');
      } else {
        color = getVal('Giá trị thuộc tính 1') || 'Tiêu chuẩn';
      }

      // 6. Giá bán & Tồn kho
      const rawPrice = Number(getVal('Giá') || 0);
      const price = isNaN(rawPrice) ? 0 : rawPrice;

      const rawOriginalPrice = Number(getVal('Giá so sánh') || price);
      const originalPrice = isNaN(rawOriginalPrice) ? price : rawOriginalPrice;

      let stock = Number(getVal('Số lượng tồn kho') || 10);
      if (price <= 0) stock = 0;
      stock = isNaN(stock) ? 0 : stock;

      const rawImg = getVal('Ảnh biến thể') || getVal('Link hình') || '';
      const imageUrl = rawImg.startsWith('http') ? rawImg : '';

      // 7. Lưu hoặc cập nhật Biến thể (ProductVariant) - Slug luôn độc nhất kèm ID biến thể
      const cleanColorSlug = color
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .replace(/[^a-z0-9]+/g, '-');
      const cleanStorageSlug = storage.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const variantSlug = `${parentSlug}-${cleanStorageSlug}-${cleanColorSlug}-${variantIdHaravan}`;

      await prisma.productVariant.upsert({
        where: { id: String(variantIdHaravan) },
        update: {
          storage,
          color,
          slug: variantSlug,
          price: price > 0 ? price : undefined,
          originalPrice: originalPrice > 0 ? originalPrice : undefined,
          stock: price <= 0 ? 0 : stock,
          images: imageUrl ? [imageUrl] : undefined,
        },
        create: {
          id: String(variantIdHaravan),
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

      variantCount++;
    }

    if (file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    return res.json({
      success: true,
      message: `Đã nạp thành công ${importedCount} dòng máy chính và ${variantCount} biến thể vào Database!`,
    });
  } catch (err: any) {
    console.error('Lỗi Import Excel:', err);
    return res.status(500).json({ success: false, error: 'Lỗi xử lý file Excel: ' + err.message });
  }
};

// ==========================================
// 9. DỌN DẸP DANH MỤC CŨ
// ==========================================
export const cleanupCategories = async (req: Request, res: Response) => {
  try {
    const validCategories = [
      'iPhone',
      'iPhone Cũ',
      'MacBook',
      'MacBook Cũ',
      'iPad',
      'iPad Cũ',
      'Watch',
      'Watch Cũ',
      'Phụ kiện',
    ];

    const deleted = await prisma.category.deleteMany({
      where: {
        name: { notIn: validCategories },
      },
    });

    return res.json({
      success: true,
      message: `Đã xóa ${deleted.count} danh mục cũ không hợp lệ.`,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 10. SUBCATEGORY (THANH LỌC TRÒN DÒNG MÁY)
// ==========================================
export const getSubCategories = async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.query;
    const subs = await prisma.subCategory.findMany({
      where: categoryId ? { categoryId: String(categoryId) } : undefined,
      orderBy: { order: 'asc' },
      include: { category: true },
    });
    return res.json({ success: true, data: subs });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const upsertSubCategory = async (req: Request, res: Response) => {
  try {
    const { id, name, categoryId, imageUrl, keyword, order } = req.body;
    if (!name || !categoryId) {
      return res.status(400).json({ success: false, error: 'Thiếu tên hoặc danh mục cha' });
    }

    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-z0-9]+/g, '-');

    if (id) {
      const updated = await prisma.subCategory.update({
        where: { id: id as string },
        data: {
          name,
          slug,
          categoryId,
          imageUrl,
          keyword: keyword || name,
          order: Number(order || 0),
        },
      });
      return res.json({ success: true, data: updated });
    }

    const created = await prisma.subCategory.create({
      data: {
        name,
        slug,
        categoryId,
        imageUrl,
        keyword: keyword || name,
        order: Number(order || 0),
      },
    });
    return res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteSubCategory = async (req: Request, res: Response) => {
  try {
    await prisma.subCategory.delete({ where: { id: req.params.id as string } });
    return res.json({ success: true, message: 'Đã xóa item lọc thành công' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 11. THỐNG KÊ ANALYTICS
// ==========================================
export const getAnalytics = async (req: Request, res: Response) => {
  try {
    const completedOrders = await prisma.order.findMany({
      where: { OR: [{ orderStatus: 'COMPLETED' }, { paymentStatus: 'PAID' }] },
    });
    const totalRevenue = completedOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalOrders = await prisma.order.count();
    const totalProducts = await prisma.product.count();
    const topSelling = await prisma.product.findMany({ take: 5, orderBy: { soldQuantity: 'desc' } });

    const last7Days = [...Array(7)]
      .map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
      })
      .reverse();

    const revenueByDay = await Promise.all(
      last7Days.map(async (day) => {
        const start = new Date(`${day}T00:00:00.000Z`);
        const end = new Date(`${day}T23:59:59.999Z`);
        const orders = await prisma.order.findMany({
          where: {
            createdAt: { gte: start, lte: end },
            OR: [{ orderStatus: 'COMPLETED' }, { paymentStatus: 'PAID' }],
          },
        });
        return { date: day, total: orders.reduce((s, o) => s + o.totalAmount, 0), ordersCount: orders.length };
      })
    );

    return res.json({
      success: true,
      data: { totalRevenue, totalOrders, totalProducts, topSelling, revenueByDay },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ==========================================
// 12. QUẢN LÝ ĐƠN HÀNG ADMIN
// ==========================================
export const getAllOrdersAdmin = async (req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: orders });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateOrderStatusAdmin = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { orderStatus, status } = req.body;

    const newOrderStatus = orderStatus || status;

    const existingOrder = await prisma.order.findUnique({
      where: { id: String(id) },
    });

    if (!existingOrder) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng!' });
    }

    const rawMethod = (existingOrder.paymentMethod || '').toLowerCase();
    const isQrPayment = ['vnpay-qr', 'momo', 'qr', 'bank'].includes(rawMethod);

    let finalPaymentStatus = existingOrder.paymentStatus;
    if (isQrPayment) {
      finalPaymentStatus = 'PAID';
    } else {
      if (newOrderStatus === 'COMPLETED') {
        finalPaymentStatus = 'PAID';
      } else if (newOrderStatus) {
        finalPaymentStatus = 'UNPAID';
      }
    }

    const updated = await prisma.order.update({
      where: { id: String(id) },
      data: {
        ...(newOrderStatus && { orderStatus: newOrderStatus }),
        paymentStatus: finalPaymentStatus,
      },
      include: { items: true },
    });

    return res.json({
      success: true,
      message: 'Cập nhật trạng thái đơn hàng thành công!',
      data: updated,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 13. HARAVAN POSTS
// ==========================================
export const importHaravanPosts = async (req: any, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Chưa đính kèm file Haravan' });
    const workbook = new ExcelJS.Workbook();
    if (req.file.originalname?.endsWith('.csv')) await workbook.csv.readFile(req.file.path);
    else await workbook.xlsx.readFile(req.file.path);

    const worksheet = workbook.worksheets[0];
    const headers: any = {};
    worksheet.getRow(1).eachCell((cell, col) => {
      headers[col] = cell.value?.toString().trim();
    });

    let count = 0;
    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      if (!row.hasValues) continue;
      const d: any = {};
      row.eachCell((cell, col) => {
        if (headers[col]) d[headers[col]] = cell.value;
      });

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

// ==========================================
// 14. BANNERS
// ==========================================
export const createBannersBulk = async (req: Request, res: Response) => {
  try {
    const { banners } = req.body;
    const created = await prisma.$transaction(
      banners.map((b: any, i: number) =>
        prisma.banner.create({
          data: {
            title: b.title || `Banner ${i + 1}`,
            imageUrl: b.imageUrl,
            linkUrl: b.linkUrl || b.link || '/',
            position: b.position || b.group || 'HOME_TOP',
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
  try {
    await prisma.banner.delete({ where: { id: req.params.id as string } });
    return res.json({ success: true, message: 'Đã xóa banner' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ==========================================
// 15. QUẢN LÝ KHÁCH HÀNG
// ==========================================
export const getCustomers = async (req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      where: {
        orderStatus: { not: 'CANCELLED' },
      },
      select: {
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        address: true,
        totalAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const customerMap = new Map<string, any>();

    orders.forEach((order) => {
      const phone = (order.customerPhone || '').trim();
      if (!phone) return;

      if (!customerMap.has(phone)) {
        customerMap.set(phone, {
          _id: phone,
          fullName: order.customerName || 'Khách vãng lai',
          phone: phone,
          email: order.customerEmail || '',
          address: order.address || '',
          totalOrders: 0,
          totalSpent: 0,
          lastOrderDate: order.createdAt,
          firstOrderDate: order.createdAt,
        });
      }

      const item = customerMap.get(phone);
      item.totalOrders += 1;
      item.totalSpent += Number(order.totalAmount || 0);
    });

    const customers = Array.from(customerMap.values()).map((c) => {
      let customerRank: 'NEW' | 'RETURNING' | 'LOYAL' | 'VIP' = 'NEW';
      if (c.totalOrders >= 5 || c.totalSpent >= 80000000) {
        customerRank = 'VIP';
      } else if (c.totalOrders >= 3 || c.totalSpent >= 30000000) {
        customerRank = 'LOYAL';
      } else if (c.totalOrders >= 2) {
        customerRank = 'RETURNING';
      }

      return { ...c, customerRank };
    });

    customers.sort(
      (a, b) => new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime()
    );

    return res.json({ success: true, data: customers });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi lấy dữ liệu khách hàng',
      error: error.message,
    });
  }
};

// ==========================================
// 16. THỐNG KÊ TRUY CẬP & PHÂN TÍCH KHÁCH HÀNG
// ==========================================
export const getTrafficAnalytics = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const end = endDate ? new Date(`${endDate}T23:59:59.999Z`) : new Date();
    const start = startDate
      ? new Date(`${startDate}T00:00:00.000Z`)
      : new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);

    const pageViews = await prisma.pageView.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { createdAt: true },
    });

    const newUsers = await prisma.user.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { createdAt: true },
    });

    const ordersInPeriod = await prisma.order.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        orderStatus: { not: 'CANCELLED' },
      },
      select: { customerPhone: true, createdAt: true },
    });

    const dayMap = new Map<string, {
      date: string;
      views: number;
      registrations: number;
      newCustomers: number;
      returningCustomers: number;
    }>();

    const curr = new Date(start);
    while (curr <= end) {
      const dStr = curr.toISOString().split('T')[0];
      dayMap.set(dStr, {
        date: dStr,
        views: 0,
        registrations: 0,
        newCustomers: 0,
        returningCustomers: 0,
      });
      curr.setDate(curr.getDate() + 1);
    }

    pageViews.forEach((pv) => {
      const dStr = pv.createdAt.toISOString().split('T')[0];
      if (dayMap.has(dStr)) dayMap.get(dStr)!.views += 1;
    });

    newUsers.forEach((u) => {
      const dStr = u.createdAt.toISOString().split('T')[0];
      if (dayMap.has(dStr)) dayMap.get(dStr)!.registrations += 1;
    });

    for (const ord of ordersInPeriod) {
      const dStr = ord.createdAt.toISOString().split('T')[0];
      const phone = (ord.customerPhone || '').trim();
      if (!phone || !dayMap.has(dStr)) continue;

      const pastOrders = await prisma.order.count({
        where: {
          customerPhone: phone,
          orderStatus: { not: 'CANCELLED' },
          createdAt: { lt: ord.createdAt },
        },
      });

      if (pastOrders === 0) {
        dayMap.get(dStr)!.newCustomers += 1;
      } else {
        dayMap.get(dStr)!.returningCustomers += 1;
      }
    }

    const data = Array.from(dayMap.values()).reverse();
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};