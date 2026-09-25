import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      include: { category: true, variants: true }
    });
    return res.json({ success: true, data: products });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

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
// Xóa hàng loạt sản phẩm
export const deleteProductsBulk = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Danh sách ID không hợp lệ' });
    }

    // Xóa toàn bộ biến thể trước
    await prisma.productVariant.deleteMany({
      where: { productId: { in: ids } },
    });

    // Xóa các sản phẩm
    await prisma.product.deleteMany({
      where: { id: { in: ids } },
    });

    return res.json({ success: true, message: `Đã xóa thành công ${ids.length} sản phẩm!` });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Lỗi khi xóa sản phẩm' });
  }
};
export const getProductBySlug = async (req: Request, res: Response) => {
  try {
    const rawSlug = decodeURIComponent(String(req.params.slug || '')).trim();
    const proid = req.query.proid ? String(req.query.proid).trim() : '';

    const cleanBaseSlug = rawSlug.replace(
      /(-(8gb|16gb|24gb|32gb|64gb|128gb|256gb|512gb|1tb|2tb|40mm|41mm|42mm|44mm|45mm|46mm|49mm))+$/gi,
      ''
    );

    let product = null;

    // 1. Ưu tiên tìm chính xác theo proid (ID sản phẩm gốc)
    if (proid) {
      product = await prisma.product.findUnique({
        where: { id: proid },
        include: { category: true, variants: true },
      });
    }

    // 2. Tìm theo cleanBaseSlug hoặc rawSlug
    if (!product) {
      product = await prisma.product.findFirst({
        where: {
          OR: [
            { slug: cleanBaseSlug },
            { slug: rawSlug },
            { slug: { startsWith: cleanBaseSlug } }
          ],
        },
        include: { category: true, variants: true },
      });
    }

    // 3. Dự phòng tìm qua slug của biến thể (Variant)
    if (!product) {
      const variant = await prisma.productVariant.findFirst({
        where: {
          OR: [
            { slug: cleanBaseSlug },
            { slug: rawSlug },
            { slug: { contains: cleanBaseSlug } }
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
      console.warn(`[API] Không tìm thấy sản phẩm với slug: "${rawSlug}", base: "${cleanBaseSlug}", proid: "${proid}"`);
      return res.status(404).json({ success: false, error: 'Không tìm thấy sản phẩm' });
    }

    // Format an toàn danh sách ảnh biến thể (khai báo imgs: any để xử lý string hoặc string[])
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