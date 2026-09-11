import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const getAllProducts = async (req: Request, res: Response) => {
  try {
    // Sửa tên biến từ product thành products để khớp với response bên dưới
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

export const getProductBySlug = async (req: Request, res: Response) => {
  try {
    const rawSlug = String(req.params.slug).trim();
    const baseSlug = rawSlug.replace(
      /-(64gb|128gb|256gb|512gb|1tb|2tb|40mm|41mm|42mm|44mm|45mm|46mm|49mm)$/i,
      ''
    );

    // XÓA BỎ { contains: baseSlug } ĐỂ TRÁNH TÌNH TRẠNG QUÉT NHẦM SẢN PHẨM CÓ CHUỖI GẦN ĐÚNG
    let product = await prisma.product.findFirst({
      where: {
        OR: [
          { slug: rawSlug },
          { slug: baseSlug },
        ],
      },
      include: {
        category: true,
        variants: true,
      },
    });

    if (!product) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy sản phẩm' });
    }

    const parsedVariants = product.variants.map((v) => {
      let imgs = v.images;
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