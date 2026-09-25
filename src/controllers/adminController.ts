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
            const orig = (v.origin || 'Việt Nam').toString().trim();
            const col = (v.color || 'Tiêu chuẩn').toString().trim();

            return {
              storage: st,
              color: col,
              origin: orig,
              slug: `${st.toLowerCase()}-${col
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
    const { productId, storage, color, origin, price, originalPrice, stock, imageUrl } = req.body;
    if (!productId || !storage || !color) {
      return res.status(400).json({ success: false, error: 'Vui lòng điền đủ thông tin bắt buộc' });
    }

    const cleanSt = storage.toString().replace(/\//g, '-');
    const p = Number(price || 0);
    const s = p <= 0 ? 0 : Number(stock || 0);
    const orig = (origin || 'Việt Nam').toString().trim();

    const variantSlug = `${cleanSt.toLowerCase()}-${color
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`;

    const newVariant = await prisma.productVariant.create({
      data: {
        productId,
        storage: cleanSt,
        color,
        origin: orig,
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
    const { storage, color, origin, price, originalPrice, stock, images } = req.body;

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
        ...(origin !== undefined && { origin: String(origin) }),
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

// =========================================================================================
// 8. IMPORT SẢN PHẨM TỰ ĐỘNG - TÁCH CHUẨN DUNG LƯỢNG, MÀU SẮC VÀ XUẤT XỨ
// =========================================================================================
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

    const headerMap: Record<string, number> = {};
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      const headerText = cell.value?.toString().trim().toLowerCase() || '';
      if (headerText) {
        headerMap[headerText] = colNumber;
      }
    });

    const getRowValue = (row: any, candidates: string[]): string => {
      for (const name of candidates) {
        const colIdx = headerMap[name.toLowerCase()];
        if (colIdx) {
          let cellVal = row.getCell(colIdx).value;
          if (cellVal === null || cellVal === undefined) continue;

          if (typeof cellVal === 'object') {
            if ('result' in cellVal) cellVal = (cellVal as any).result;
            else if ('richText' in cellVal) cellVal = (cellVal as any).richText.map((t: any) => t.text).join('');
            else if ('text' in cellVal) cellVal = (cellVal as any).text;
          }
          const str = String(cellVal).trim();
          if (str) return str;
        }
      }
      return '';
    };

    const parseNum = (val: string): number => {
      if (!val) return 0;
      const clean = val.replace(/[^0-9]/g, '');
      return clean ? Number(clean) : 0;
    };

    const categoryCache: Record<string, string> = {};
    const defaultCategories = ['iPhone', 'iPhone Cũ', 'MacBook', 'MacBook Cũ', 'iPad', 'iPad Cũ', 'Watch', 'Watch Cũ', 'Phụ kiện'];
    for (const cName of defaultCategories) {
      const found = await prisma.category.findFirst({ where: { name: cName } });
      if (found) categoryCache[cName] = found.id;
    }

    const modelGroupMap = new Map<string, {
      productName: string;
      parentSlug: string;
      categoryName: string;
      description: string;
      variants: any[];
    }>();

    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      if (!row.hasValues) continue;

      const rawFullName = getRowValue(row, ['tên sản phẩm', 'tên', 'title', 'product name']);
      if (!rawFullName) continue;

      const opt1Name = getRowValue(row, ['thuộc tính 1', 'option1 name']).toLowerCase();
      const opt1Val = getRowValue(row, ['giá trị thuộc tính 1', 'option1 value']);
      const opt2Name = getRowValue(row, ['thuộc tính 2', 'option2 name']).toLowerCase();
      const opt2Val = getRowValue(row, ['giá trị thuộc tính 2', 'option2 value']);

      // 1. TÁCH DUNG LƯỢNG CHUẨN TỪ TÊN SẢN PHẨM (Ví dụ: 128GB, 256GB, 512GB, 1TB, 2TB...)
      const capPattern = /\b(\d+\s*(?:GB|TB)(?:\s*\/\s*\d+\s*(?:GB|TB))?|\d+\s*mm|\d+\s*W)\b/i;
      const matchCap = rawFullName.match(capPattern);
      let storage = '';

      if (matchCap) {
        storage = matchCap[1].replace(/\s+/g, '').toUpperCase();
      } else {
        const directStorage = getRowValue(row, ['dung lượng / kích thước', 'dung lượng']);
        if (/^\d+\s*(?:GB|TB|mm|W)$/i.test(directStorage)) {
          storage = directStorage.replace(/\s+/g, '').toUpperCase();
        } else if (/^\d+\s*(?:GB|TB|mm|W)$/i.test(opt1Val)) {
          storage = opt1Val.replace(/\s+/g, '').toUpperCase();
        } else if (/^\d+\s*(?:GB|TB|mm|W)$/i.test(opt2Val)) {
          storage = opt2Val.replace(/\s+/g, '').toUpperCase();
        } else {
          storage = 'Tiêu chuẩn';
        }
      }
      storage = storage.replace(/\//g, '-').trim();

      // 2. TÁCH XUẤT XỨ CHUẨN (Việt Nam, Nhập Khẩu, VN/A, LL/A...)
      let origin = '';
      if (opt1Name.includes('xuất xứ') || opt1Name.includes('xuat xu')) origin = opt1Val;
      else if (opt2Name.includes('xuất xứ') || opt2Name.includes('xuat xu')) origin = opt2Val;
      else if (/việt nam|nhập khẩu|vn\/a|ll\/a|za\/a|chính hãng/i.test(opt1Val)) origin = opt1Val;
      else if (/việt nam|nhập khẩu|vn\/a|ll\/a|za\/a|chính hãng/i.test(opt2Val)) origin = opt2Val;
      else origin = 'Việt Nam';

      // 3. TÁCH MÀU SẮC CHUẨN (Lavender, Sage, Mist Blue, Black, White...)
      let color = '';
      if (opt1Name.includes('color') || opt1Name.includes('màu')) color = opt1Val;
      else if (opt2Name.includes('color') || opt2Name.includes('màu')) color = opt2Val;
      else {
        const directColor = getRowValue(row, ['màu sắc', 'màu']);
        if (directColor && !/việt nam|nhập khẩu/i.test(directColor)) {
          color = directColor;
        } else if (opt1Val && opt1Val !== origin && opt1Val !== storage && !/seal|kích hoạt|like new|99%/i.test(opt1Val)) {
          color = opt1Val;
        } else if (opt2Val && opt2Val !== origin && opt2Val !== storage && !/seal|kích hoạt|like new|99%/i.test(opt2Val)) {
          color = opt2Val;
        }
      }
      if (!color) color = 'Tiêu chuẩn';

      // 4. LÀM SẠCH TÊN SẢN PHẨM CHA (Loại bỏ dung lượng để gom nhóm)
      const cleanProductName = rawFullName
        .replace(capPattern, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[-\s/]+$/, '');

      const rawModelSlug = getRowValue(row, ['mã model (slug cha)', 'mã model', 'model slug', 'parent slug']);
      let parentSlug = rawModelSlug;
      if (!parentSlug) {
        parentSlug = cleanProductName
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[đĐ]/g, 'd')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      } else {
        parentSlug = parentSlug.replace(/-(256gb|512gb|1tb|2tb|128gb|64gb).*$/i, '').trim();
      }

      const rawPrice = getRowValue(row, ['giá bán (vnđ)', 'giá bán', 'giá', 'variant price']);
      const rawOriginalPrice = getRowValue(row, ['giá gốc (vnđ)', 'giá gốc', 'giá so sánh', 'compare at price']);
      const rawStock = getRowValue(row, ['tồn kho (máy)', 'tồn kho', 'số lượng tồn kho', 'variant inventory qty']);
      const rawImage = getRowValue(row, ['ảnh màu sắc', 'ảnh biến thể', 'link hình', 'image src']);
      const rawDescription = getRowValue(row, ['mô tả', 'body (html)', 'description']);
      const rawCategory = getRowValue(row, ['danh mục', 'loại sản phẩm', 'product type', 'category']);
      const rawVariantId = getRowValue(row, ['mã biến thể', 'variant id', 'id']);

      const price = parseNum(rawPrice);
      const originalPrice = parseNum(rawOriginalPrice) || price;
      const stock = price <= 0 ? 0 : (parseNum(rawStock) || 10);

      let finalCategoryName = rawCategory;
      const combined = `${rawCategory} ${cleanProductName}`.toLowerCase();
      const isUsed = combined.includes('cũ') || combined.includes('like new') || combined.includes('99%');

      if (combined.includes('iphone')) finalCategoryName = isUsed ? 'iPhone Cũ' : 'iPhone';
      else if (combined.includes('ipad')) finalCategoryName = isUsed ? 'iPad Cũ' : 'iPad';
      else if (combined.includes('macbook') || combined.includes('mac')) finalCategoryName = isUsed ? 'MacBook Cũ' : 'MacBook';
      else if (combined.includes('watch')) finalCategoryName = isUsed ? 'Watch Cũ' : 'Watch';
      else if (!finalCategoryName) finalCategoryName = 'Phụ kiện';

      if (!modelGroupMap.has(parentSlug)) {
        modelGroupMap.set(parentSlug, {
          productName: cleanProductName,
          parentSlug: parentSlug,
          categoryName: finalCategoryName,
          description: rawDescription || `Sản phẩm chính hãng ${cleanProductName} tại FoGo Store`,
          variants: [],
        });
      }

      const cleanColorSlug = color
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .replace(/[^a-z0-9]+/g, '-');
      const cleanStorageSlug = storage.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const cleanOriginSlug = origin.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      const variantSlug = `${parentSlug}-${cleanStorageSlug}-${cleanColorSlug}-${cleanOriginSlug}`.replace(/-+/g, '-');

      modelGroupMap.get(parentSlug)!.variants.push({
        rawVariantId,
        storage,
        color,
        origin,
        price,
        originalPrice,
        stock,
        slug: variantSlug,
        imageUrl: rawImage.startsWith('http') ? rawImage : '',
      });
    }

    let importedVariantCount = 0;

    for (const [parentSlug, item] of modelGroupMap.entries()) {
      let catId = categoryCache[item.categoryName];
      if (!catId) {
        let cat = await prisma.category.findFirst({ where: { name: item.categoryName } });
        if (!cat) {
          const catSlug = item.categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          cat = await prisma.category.create({ data: { name: item.categoryName, slug: catSlug } });
        }
        catId = cat.id;
        categoryCache[item.categoryName] = catId;
      }

      let product = await prisma.product.findFirst({
        where: {
          OR: [{ slug: parentSlug }, { name: item.productName }],
        },
      });

      if (!product) {
        product = await prisma.product.create({
          data: {
            name: item.productName,
            slug: parentSlug,
            categoryId: catId,
            description: item.description,
          },
        });
      } else if (item.description && (!product.description || product.description.length < 50)) {
        await prisma.product.update({
          where: { id: product.id },
          data: { description: item.description },
        });
      }

      for (const v of item.variants) {
        const existingVar = await prisma.productVariant.findFirst({
          where: {
            productId: product.id,
            storage: v.storage,
            color: v.color,
            origin: v.origin,
          },
        });

        if (existingVar) {
          await prisma.productVariant.update({
            where: { id: existingVar.id },
            data: {
              slug: v.slug,
              price: v.price,
              originalPrice: v.originalPrice,
              stock: v.stock,
              origin: v.origin,
              ...(v.imageUrl && { images: [v.imageUrl] }),
            },
          });
        } else {
          await prisma.productVariant.create({
            data: {
              productId: product.id,
              storage: v.storage,
              color: v.color,
              origin: v.origin,
              slug: v.slug,
              price: v.price,
              originalPrice: v.originalPrice,
              stock: v.stock,
              images: v.imageUrl ? [v.imageUrl] : [],
            },
          });
          importedVariantCount++;
        }
      }
    }

    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (e) {
        console.warn('Không thể xóa file tạm:', e);
      }
    }

    return res.json({
      success: true,
      message: `Đã nạp thành công ${modelGroupMap.size} dòng máy và ${importedVariantCount} cấu hình biến thể vào kho FoGo Store!`,
    });
  } catch (err: any) {
    console.error('Lỗi Import Excel:', err);
    return res.status(500).json({ success: false, error: 'Lỗi xử lý file Excel: ' + err.message });
  }
};

// =========================================================================================
// 8.1 API CHẠY 1 LẦN: TỰ ĐỘNG ĐẢO SỬA LẠI CÁC DÒNG ĐANG BỊ LỆCH TRONG DATABASE HIỆN TẠI
// =========================================================================================
export const fixSwappedAttributesInDB = async (req: Request, res: Response) => {
  try {
    const variants = await prisma.productVariant.findMany({
      include: { product: true },
    });

    let fixedCount = 0;

    for (const v of variants) {
      const rawStorage = (v.storage || '').trim();
      const rawColor = (v.color || '').trim();

      const isColorInStorage = /lavender|sage|mist blue|black|white|silver|gold|burgundy|glacier|blue|purple|yellow|red|midnight|starlight|orange|seal|kích hoạt/i.test(rawStorage);
      const isOriginInColor = /việt nam|nhập khẩu|vn\/a|ll\/a|za\/a/i.test(rawColor);

      if (isColorInStorage || isOriginInColor) {
        const capMatch = v.product.name.match(/\b(\d+\s*(?:GB|TB))\b/i);
        const realStorage = capMatch ? capMatch[1].replace(/\s+/g, '').toUpperCase() : '256GB';

        const realColor = isColorInStorage && !/seal|kích hoạt/i.test(rawStorage) ? rawStorage : 'Tiêu chuẩn';
        const realOrigin = isOriginInColor ? rawColor : 'Việt Nam';

        await prisma.productVariant.update({
          where: { id: v.id },
          data: {
            storage: realStorage,
            color: realColor,
            origin: realOrigin,
          },
        });
        fixedCount++;
      }
    }

    return res.json({
      success: true,
      message: `Đã tự động đảo và sửa đúng vị trí Dung lượng, Màu sắc, Xuất xứ cho ${fixedCount} cấu hình trong kho!`,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
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