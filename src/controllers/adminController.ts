import { Request, Response } from 'express';
import fs from 'fs';
import zlib from 'zlib';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma';

// 1. Lấy tồn kho & biến thể sản phẩm
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

// 2. Tạo sản phẩm đầy đủ kèm biến thể
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
            return {
              storage: st,
              color: v.color || 'Tiêu chuẩn',
              slug: `${st.toLowerCase()}-${(v.color || 'tc')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-3)}`,
              price: Number(v.price || 0),
              originalPrice: Number(v.originalPrice || v.price || 0),
              stock: Number(v.stock || 0),
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

// 3. Xóa sản phẩm gốc
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

// 4. Thêm biến thể cho sản phẩm sẵn có
export const addVariant = async (req: Request, res: Response) => {
  try {
    const { productId, storage, color, price, originalPrice, stock, imageUrl } = req.body;
    if (!productId || !storage || !color || !price) {
      return res.status(400).json({ success: false, error: 'Vui lòng điền đủ thông tin bắt buộc' });
    }

    const cleanSt = storage.toString().replace(/\//g, '-');
    const variantSlug = `${cleanSt.toLowerCase()}-${color
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`;

    const newVariant = await prisma.productVariant.create({
      data: {
        productId,
        storage: cleanSt,
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

// 5. Cập nhật biến thể
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

    const updated = await prisma.productVariant.update({
      where: { id },
      data: {
        ...(storage !== undefined && { storage: String(storage).replace(/\//g, '-') }),
        ...(color !== undefined && { color: String(color) }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(originalPrice !== undefined && { originalPrice: parseFloat(originalPrice) }),
        ...(stock !== undefined && { stock: parseInt(stock, 10) }),
        ...(formattedImages.length > 0 && { images: formattedImages }),
      },
      include: {
        product: { include: { category: true } },
      },
    });

    return res.json({ success: true, message: 'Đã lưu cấu hình biến thể vào Database!', data: updated });
  } catch (error: any) {
    console.error('Lỗi cập nhật biến thể:', error);
    return res.status(500).json({ success: false, error: error.message || 'Lỗi cập nhật biến thể' });
  }
};

// 6. Cập nhật nhanh tồn kho (PATCH)
export const patchVariant = async (req: Request, res: Response) => {
  try {
    const id = (req.params.variantId || req.params.id) as string;
    const { stock, price } = req.body;
    const updated = await prisma.productVariant.update({
      where: { id },
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

// 7. Xóa biến thể
export const deleteVariant = async (req: Request, res: Response) => {
  try {
    const id = (req.params.variantId || req.params.id) as string;
    await prisma.productVariant.delete({ where: { id } });
    return res.json({ success: true, message: 'Đã xóa biến thể thành công khỏi Database' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// --- BỘ GIẢI MÃ VÀ TRÍCH XUẤT HARAVAN EXCEL AN TOÀN ---
const decodeHtmlEntities = (str: string): string => {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
};

const extractSheet1Xml = (buffer: Buffer): string => {
  let pos = 0;
  const bufLen = buffer.length;

  while (pos < bufLen - 4) {
    if (buffer.readUInt32LE(pos) !== 0x04034b50) {
      pos++;
      continue;
    }

    const compMethod = buffer.readUInt16LE(pos + 8);
    const compSize = buffer.readUInt32LE(pos + 18);
    const fnLen = buffer.readUInt16LE(pos + 26);
    const extraLen = buffer.readUInt16LE(pos + 28);

    const filename = buffer.toString('utf8', pos + 30, pos + 30 + fnLen);
    const dataStart = pos + 30 + fnLen + extraLen;
    const compressedData = buffer.subarray(dataStart, dataStart + compSize);

    if (filename === 'xl/worksheets/sheet1.xml') {
      if (compMethod === 0) {
        return compressedData.toString('utf8');
      } else if (compMethod === 8) {
        return zlib.inflateRawSync(compressedData).toString('utf8');
      }
      throw new Error(`Phương thức nén không hỗ trợ: ${compMethod}`);
    }

    pos = dataStart + compSize;
  }

  throw new Error('Không tìm thấy sheet dữ liệu trong file Excel');
};

// 8. Import sản phẩm từ Excel Haravan (Tự động thay / thành - trong dung lượng)
export const importExcel = async (req: any, res: Response) => {
  try {
    let fileBuffer: Buffer | null = null;

    if (req.file?.buffer) {
      fileBuffer = req.file.buffer;
    } else if (req.file?.path && fs.existsSync(req.file.path)) {
      fileBuffer = fs.readFileSync(req.file.path);
      fs.unlinkSync(req.file.path);
    }

    if (!fileBuffer) {
      return res.status(400).json({ success: false, error: 'Chưa đính kèm file Excel hợp lệ' });
    }

    const xmlContent = extractSheet1Xml(fileBuffer);
    const rowMatches = xmlContent.match(/<x:row>(.*?)<\/x:row>/gs);
    if (!rowMatches || rowMatches.length < 2) {
      return res.status(400).json({ success: false, error: 'File Excel rỗng hoặc không chứa dữ liệu hàng' });
    }

    const parseRowCells = (rowXml: string): string[] => {
      const cellMatches = rowXml.match(/<x:c\b[^>]*?(?:\/>|>.*?<\/x:c>)/gs) || [];
      return cellMatches.map((c) => {
        const vMatch = c.match(/<x:v>(.*?)<\/x:v>/s);
        return vMatch ? decodeHtmlEntities(vMatch[1]) : '';
      });
    };

    const headers = parseRowCells(rowMatches[0]);
    const headerMap: Record<string, number> = {};
    headers.forEach((h, idx) => {
      if (h) headerMap[h.trim()] = idx;
    });

    let importedCount = 0;
    let variantCount = 0;
    const categoryCache: Record<string, string> = {};

    for (let r = 1; r < rowMatches.length; r++) {
      const cells = parseRowCells(rowMatches[r]);
      if (!cells || cells.length === 0) continue;

      const getVal = (colName: string): string => {
        const idx = headerMap[colName];
        return idx !== undefined && cells[idx] !== undefined ? cells[idx].trim() : '';
      };

      const productIdHaravan = Number(getVal('Mã sản phẩm') || 0);
      const fullName = getVal('Tên');
      if (!fullName || productIdHaravan === 0) continue;

      // Trích xuất dung lượng và thay thế ngay ký tự / thành - (Ví dụ: 36GB/2TB -> 36GB-2TB)
      const storageMatch = fullName.match(/\b(\d+\s*(?:GB|TB)(\s*\/\s*\d+\s*(?:GB|TB))?)\b/i);
      const rawStorage = storageMatch ? storageMatch[1].replace(/\s+/g, '').toUpperCase() : 'Tiêu chuẩn';
      const storage = rawStorage.replace(/\//g, '-'); // <-- QUAN TRỌNG: Triệt tiêu dấu /

      const cleanName = fullName
        .replace(/\b(\d+\s*(?:GB|TB)(\s*\/\s*(?:\d+\s*)?(?:GB|TB))?)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      const rawCategory = (getVal('Loại sản phẩm') || getVal('Danh Mục') || '').toLowerCase();
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

      const parentSlug = cleanName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      let prod = await prisma.product.findUnique({ where: { slug: parentSlug } });
      const rawDescription = getVal('Mô tả');
      const descriptionContent = rawDescription || `Sản phẩm chính hãng ${cleanName} tại Fogo Store`;

      if (!prod) {
        prod = await prisma.product.create({
          data: {
            name: cleanName,
            slug: parentSlug,
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

      let color = getVal('Màu Sắc');
      if (!color) {
        if (getVal('Thuộc tính 1') === 'Color') color = getVal('Giá trị thuộc tính 1');
        else if (getVal('Thuộc tính 2') === 'Color') color = getVal('Giá trị thuộc tính 2');
        else if (getVal('Thuộc tính 3') === 'Color') color = getVal('Giá trị thuộc tính 3');
      }
      if (!color) color = 'Tiêu chuẩn';

      const rawPrice = Number(getVal('Giá') || getVal('Giá Bán') || 0);
      const price = isNaN(rawPrice) ? 0 : rawPrice;

      const rawOriginalPrice = Number(getVal('Giá so sánh') || getVal('Giá Gốc') || price);
      const originalPrice = isNaN(rawOriginalPrice) ? price : rawOriginalPrice;

      const rawStock = Number(getVal('Số lượng tồn kho') || getVal('Tồn Kho') || 10);
      const stock = isNaN(rawStock) ? 10 : rawStock;

      const rawImg = getVal('Ảnh biến thể') || getVal('Link hình') || getVal('Ảnh');
      const imageUrl = rawImg.startsWith('http') ? rawImg : '';

      const cleanColorSlug = color
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .replace(/[^a-z0-9]+/g, '-');
      const cleanStorageSlug = storage.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const variantSlug = `${parentSlug}-${cleanStorageSlug}-${cleanColorSlug}`;

      const existingVariant = await prisma.productVariant.findFirst({
        where: { productId: prod.id, slug: variantSlug },
      });

      if (existingVariant) {
        await prisma.productVariant.update({
          where: { id: existingVariant.id },
          data: {
            price: price > 0 ? price : existingVariant.price,
            originalPrice: originalPrice > 0 ? originalPrice : existingVariant.originalPrice,
            stock,
            images: imageUrl ? Array.from(new Set([...existingVariant.images, imageUrl])) : existingVariant.images,
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
      variantCount++;
    }

    return res.json({
      success: true,
      message: `Đã nhập thành công! Tạo ${importedCount} sản phẩm chính và ${variantCount} biến thể kèm đầy đủ mô tả HTML.`,
    });
  } catch (err: any) {
    console.error('Lỗi Import Excel:', err);
    return res.status(500).json({ success: false, error: 'Lỗi xử lý file Excel: ' + err.message });
  }
};

// 9. Dọn dẹp danh mục
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

// 10. SubCategory
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

// 11. Thống kê Analytics
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

// 12. Quản lý đơn hàng Admin
export const getAllOrdersAdmin = async (req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: orders });
  } catch (error: any) {
    console.error('Lỗi lấy danh sách đơn Admin:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateOrderStatusAdmin = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { orderStatus, paymentStatus } = req.body;

    const updated = await prisma.order.update({
      where: { id: String(id) },
      data: {
        ...(orderStatus && { orderStatus }),
        ...(paymentStatus && { paymentStatus }),
      },
      include: { items: true },
    });

    return res.json({
      success: true,
      message: 'Cập nhật trạng thái đơn thành công',
      data: updated,
    });
  } catch (error: any) {
    console.error('Lỗi update trạng thái đơn:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 13. Haravan Posts
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

// 14. Banners
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