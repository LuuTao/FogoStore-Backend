import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { clearCachePattern } from '../middlewares/cacheMiddleware';

// ============================================================================
// 1. LẤY TẤT CẢ SẢN PHẨM & TOÀN BỘ CÁC BIẾN THỂ TRONG DB (CHẤP NHẬN CẢ GIÁ 0Đ)
// ============================================================================
export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const search = req.query.search ? String(req.query.search).trim() : '';
    const isGetAll = req.query.all === 'true' || req.query.limit === 'all';

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = isGetAll ? 500 : Math.min(100, Number(req.query.limit) || 20);
    const skip = isGetAll ? 0 : (page - 1) * limit;

    const whereClause: any = {
      name: { not: '' },
    };

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { category: { name: { contains: search, mode: 'insensitive' } } },
        {
          variants: {
            some: {
              OR: [
                { storage: { contains: search, mode: 'insensitive' } },
                { color: { contains: search, mode: 'insensitive' } },
                { slug: { contains: search, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: whereClause,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          specs: true,
          slug: true,
          isFeatured: true,
          isFlashSale: true,
          isHot: true,
          createdAt: true,
          category: {
            select: { id: true, name: true, slug: true },
          },
          series: {
            select: { id: true, name: true, slug: true },
          },
          // Lấy trọn vẹn TẤT CẢ các biến thể trong DB, không giới hạn
          variants: {
            select: {
              id: true,
              price: true,
              originalPrice: true,
              stock: true,
              images: true,
              color: true,
              storage: true,
              slug: true,
            },
            orderBy: { price: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.count({ where: whereClause }),
    ]);

    const cleanedProducts = products.map((prod) => {
      const savedSpecs = prod.specs && typeof prod.specs === 'object' && !Array.isArray(prod.specs)
        ? prod.specs as Record<string, unknown>
        : {};
      return {
      ...prod,
      specifications: savedSpecs.specifications || prod.specs,
      salesPolicy: savedSpecs.salesPolicy || '',
      variants: (prod.variants || []).map((v) => {
        let imgs: any = v.images;
        if (typeof imgs === 'string') {
          try {
            imgs = JSON.parse(imgs);
          } catch {
            imgs = [imgs];
          }
        }
        return {
          ...v,
          images: Array.isArray(imgs) ? imgs : [],
        };
      }),
    }});

    return res.json({
      success: true,
      data: cleanedProducts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Lỗi getAllProducts:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// 2. BỘ LỌC SẢN PHẨM
// ============================================================================
export const filterProducts = async (req: Request, res: Response) => {
  try {
    const { category, isFeatured, isFlashSale, isHot } = req.query;

    const whereClause: any = {
      name: { not: '' },
    };

    if (category) {
      const catStr = String(category).toLowerCase().trim();
      whereClause.OR = [
        { category: { slug: { contains: catStr, mode: 'insensitive' } } },
        { category: { name: { contains: catStr, mode: 'insensitive' } } },
        { name: { contains: catStr, mode: 'insensitive' } }, // Fallback nếu sản phẩm gắn danh mục khác
      ];
    }

    if (isFeatured === 'true') whereClause.isFeatured = true;
    if (isFlashSale === 'true') whereClause.isFlashSale = true;
    if (isHot === 'true') whereClause.isHot = true;

    const products = await prisma.product.findMany({
      where: whereClause,
      include: {
        category: true,
        variants: {
          orderBy: { price: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const cleaned = products.map((p) => ({
      ...p,
      variants: (p.variants || []).map((v) => {
        let imgs: any = v.images;
        if (typeof imgs === 'string') {
          try {
            imgs = JSON.parse(imgs);
          } catch {
            imgs = [imgs];
          }
        }
        return { ...v, images: Array.isArray(imgs) ? imgs : [] };
      }),
    }));

    return res.json({ success: true, data: cleaned });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================================
// 2.1 DỮ LIỆU GỌN CHO TRANG CHỦ
// Chỉ trả về trường thực sự dùng trên thẻ sản phẩm để Home không phải tải cả
// mô tả/thông số của mọi biến thể ngay lần đầu người dùng mở trang.
// ============================================================================
export const getHomeProducts = async (req: Request, res: Response) => {
  try {
    const category = String(req.query.category || '').trim().toLowerCase();
    const whereClause: any = { name: { not: '' } };

    if (category) {
      whereClause.OR = [
        { category: { slug: { contains: category, mode: 'insensitive' } } },
        { category: { name: { contains: category, mode: 'insensitive' } } },
        { name: { contains: category, mode: 'insensitive' } },
      ];
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        slug: true,
        specs: true,
        isFeatured: true,
        category: { select: { name: true, slug: true } },
        variants: {
          select: {
            id: true,
            slug: true,
            storage: true,
            color: true,
            size: true,
            version: true,
            price: true,
            originalPrice: true,
            stock: true,
            images: true,
          },
          orderBy: { price: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const cleanedProducts = products.map((product) => {
      const savedSpecs = product.specs && typeof product.specs === 'object' && !Array.isArray(product.specs)
        ? product.specs as Record<string, unknown>
        : {};
      const selectedStorages = new Set<string>();
      const compactVariants = (product.variants || []).flatMap((variant) => {
        // Giao diện Home chỉ lấy biến thể đầu tiên của mỗi dung lượng/cấu hình.
        // Giữ đúng hành vi cũ nhưng không gửi các màu trùng lặp về trình duyệt.
        const storageKey = String(variant.storage || '').trim().toLowerCase() || variant.id;
        if (selectedStorages.has(storageKey)) return [];
        selectedStorages.add(storageKey);

        return [{
          ...variant,
          images: Array.isArray(variant.images) && variant.images[0] ? [variant.images[0]] : [],
        }];
      });

      return {
        ...product,
        // Chỉ giữ tag hiển thị, không đưa mô tả/chính sách dài vào response Home.
        specs: Array.isArray(savedSpecs.productTags) ? { productTags: savedSpecs.productTags } : undefined,
        variants: compactVariants,
      };
    });

    return res.json({ success: true, data: cleanedProducts });
  } catch (error: any) {
    console.error('Lỗi getHomeProducts:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
// ============================================================================
// 3. CHI TIẾT SẢN PHẨM THEO SLUG (TỰ ĐỘNG BÓC TÁCH CHUẨN XÁC BIẾN THỂ TỪ URL)
// ============================================================================
export const getProductBySlug = async (req: Request, res: Response) => {
  try {
    const rawSlug = decodeURIComponent(String(req.params.slug || '')).trim().toLowerCase();
    const proid = req.query.proid ? String(req.query.proid).trim() : '';

    let product: any = null;
    let targetVariantId: string | null = null;

    if (proid) {
      product = await prisma.product.findUnique({
        where: { id: proid },
        include: { category: true, variants: true },
      });
    }

    if (!product) {
      const matchedVariant = await prisma.productVariant.findFirst({
        where: {
          OR: [
            { slug: rawSlug },
            { slug: { startsWith: rawSlug } },
            { slug: { contains: rawSlug } },
          ],
        },
        include: {
          product: {
            include: { category: true, variants: true },
          },
        },
      });

      if (matchedVariant) {
        product = matchedVariant.product;
        targetVariantId = matchedVariant.id;
      }
    }

    if (!product) {
      let cleanSlug = rawSlug.replace(/-\d{6,}$/gi, '');

      product = await prisma.product.findFirst({
        where: {
          OR: [
            { slug: rawSlug },
            { slug: cleanSlug },
          ],
        },
        include: { category: true, variants: true },
      });

      if (!product) {
        const baseProductSlug = cleanSlug
          .replace(/-(2tb|1tb|512gb|256gb|128gb|64gb|32gb|16gb|8gb)/gi, '')
          .replace(/-(black|white|silver|gold|gray|grey|titanium|blue|pink|green|yellow|orange|purple|starlight|midnight)/gi, '')
          .replace(/-(40mm|41mm|42mm|44mm|45mm|46mm|49mm)/gi, '')
          .replace(/-+$/gi, '');

        product = await prisma.product.findFirst({
          where: {
            OR: [
              { slug: baseProductSlug },
              { slug: { startsWith: baseProductSlug } },
            ],
          },
          include: { category: true, variants: true },
        });
      }
    }

    if (!product) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy sản phẩm' });
    }

    const parsedVariants = product.variants.map((v: any) => {
      let imgs: any = v.images;
      if (typeof imgs === 'string') {
        try {
          imgs = JSON.parse(imgs);
        } catch {
          imgs = [imgs];
        }
      }
      return {
        ...v,
        images: Array.isArray(imgs) ? imgs : [],
      };
    });

    let matchedVariant = null;
    if (targetVariantId) {
      matchedVariant = parsedVariants.find((v: any) => v.id === targetVariantId);
    }

    if (!matchedVariant) {
      matchedVariant = parsedVariants.find((v: any) => {
        const storageMatch = v.storage && rawSlug.includes(String(v.storage).toLowerCase());
        const colorMatch = v.color && rawSlug.includes(String(v.color).toLowerCase());
        return storageMatch && colorMatch;
      }) || parsedVariants.find((v: any) => {
        return v.storage && rawSlug.includes(String(v.storage).toLowerCase());
      }) || parsedVariants[0];
    }

    return res.json({
      success: true,
      data: {
        ...product,
        specifications: (product.specs as any)?.specifications || product.specs,
        salesPolicy: (product.specs as any)?.salesPolicy || '',
        variants: parsedVariants,
        matchedVariantId: matchedVariant?.id || null,
        initialVariant: matchedVariant || null,
      },
    });
  } catch (err: any) {
    console.error('Lỗi getProductBySlug:', err);
    return res.status(500).json({ success: false, error: 'Lỗi server' });
  }
};

// ============================================================================
// 4. LẤY DANH SÁCH DANH MỤC
// ============================================================================
export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    return res.json({ success: true, data: categories });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// 5. XÓA HÀNG LOẠT SẢN PHẨM & TỰ ĐỘNG XÓA CACHE
// ============================================================================
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

    await clearCachePattern('fogo_cache:*');

    return res.json({ success: true, message: `Đã xóa thành công ${ids.length} sản phẩm!` });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Lỗi khi xóa sản phẩm' });
  }
};
