import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { clearCachePattern } from '../middlewares/cacheMiddleware';

// ============================================================================
// 1. LẤY TẤT CẢ SẢN PHẨM (HỖ TRỢ NẠP TOÀN BỘ CACHE VÀ TÌM KIẾM THEO TỪ KHÓA)
// ============================================================================
export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const search = req.query.search ? String(req.query.search).trim() : '';
    const isGetAll = req.query.all === 'true' || req.query.limit === 'all';

    const page = Math.max(1, Number(req.query.page) || 1);
    // Khi gọi nạp cache tìm kiếm (all=true) cho phép lấy tối đa 500 sản phẩm
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
          slug: true,
          isFeatured: true,
          isFlashSale: true,
          isHot: true,
          category: {
            select: { id: true, name: true, slug: true },
          },
          variants: {
            take: 1, // Lấy biến thể đầu tiên để lấy giá & hình ảnh đại diện
            select: {
              id: true,
              price: true,
              originalPrice: true,
              stock: true,
              images: true,
              color: true,
              storage: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.count({ where: whereClause }),
    ]);

    const cleanedProducts = products.map((prod) => ({
      ...prod,
      variants: prod.variants.map((v) => {
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
    }));

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
// 2. BỘ LỌC SẢN PHẨM (DANH MỤC, HOT, SALE, FEATURED)
// ============================================================================
export const filterProducts = async (req: Request, res: Response) => {
  try {
    const { category, isFeatured, isFlashSale, isHot } = req.query;

    const whereClause: any = {
      name: { not: '' },
      variants: { some: {} },
    };

    if (category) {
      whereClause.category = { slug: String(category).toLowerCase() };
    }
    if (isFeatured === 'true') whereClause.isFeatured = true;
    if (isFlashSale === 'true') whereClause.isFlashSale = true;
    if (isHot === 'true') whereClause.isHot = true;

    const products = await prisma.product.findMany({
      where: whereClause,
      include: {
        category: true,
        variants: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const cleaned = products.map((p) => ({
      ...p,
      variants: p.variants.map((v) => {
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
// 3. CHI TIẾT SẢN PHẨM THEO SLUG HOẶC ID
// ============================================================================
export const getProductBySlug = async (req: Request, res: Response) => {
  try {
    const rawSlug = decodeURIComponent(String(req.params.slug || '')).trim();
    const proid = req.query.proid ? String(req.query.proid).trim() : '';

    const cleanBaseSlug = rawSlug.replace(
      /(-(8gb|16gb|24gb|32gb|64gb|128gb|256gb|512gb|1tb|2tb|40mm|41mm|42mm|44mm|45mm|46mm|49mm))+$/gi,
      ''
    );

    let product = null;

    if (proid) {
      product = await prisma.product.findUnique({
        where: { id: proid },
        include: { category: true, variants: true },
      });
    }

    if (!product) {
      product = await prisma.product.findFirst({
        where: {
          OR: [
            { slug: cleanBaseSlug },
            { slug: rawSlug },
            { slug: { startsWith: cleanBaseSlug } },
          ],
        },
        include: { category: true, variants: true },
      });
    }

    if (!product) {
      const variant = await prisma.productVariant.findFirst({
        where: {
          OR: [
            { slug: cleanBaseSlug },
            { slug: rawSlug },
            { slug: { contains: cleanBaseSlug } },
          ],
        },
        include: {
          product: {
            include: { category: true, variants: true },
          },
        },
      });
      if (variant) {
        product = variant.product;
      }
    }

    if (!product) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy sản phẩm' });
    }

    const parsedVariants = product.variants.map((v) => {
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

    return res.json({ success: true, data: { ...product, variants: parsedVariants } });
  } catch (err: any) {
    console.error('Lỗi lấy chi tiết sản phẩm:', err);
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