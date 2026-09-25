import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { clearCachePattern } from '../middlewares/cacheMiddleware';

// 1. Lấy tất cả sản phẩm
export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      include: { category: true, variants: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: products });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 2. Bộ lọc sản phẩm (danh mục, hot, sale, featured)
export const filterProducts = async (req: Request, res: Response) => {
  try {
    const { category, isFeatured, isFlashSale, isHot } = req.query;
    const whereClause: any = {};

    if (category) {
      whereClause.category = { slug: String(category).toLowerCase() };
    }
    if (isFeatured === 'true') whereClause.isFeatured = true;
    if (isFlashSale === 'true') whereClause.isFlashSale = true;
    if (isHot === 'true') whereClause.isHot = true;

    const products = await prisma.product.findMany({
      where: whereClause,
      include: { category: true, variants: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: products });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// 3. Chi tiết sản phẩm theo slug hoặc ID
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

// 4. Lấy danh sách danh mục
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

// 5. Xóa hàng loạt sản phẩm (tự động xóa cache)
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

    // Làm mới cache sản phẩm
    await clearCachePattern('fogo_cache:*');

    return res.json({ success: true, message: `Đã xóa thành công ${ids.length} sản phẩm!` });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Lỗi khi xóa sản phẩm' });
  }
};