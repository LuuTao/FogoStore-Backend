import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { PRODUCT_TAGS } from '../lib/productTags';
import { clearCachePattern } from '../middlewares/cacheMiddleware';

export function validateTags(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 4 && value.every(tag => PRODUCT_TAGS.includes(tag));
}

export async function updateProductTags(req: Request, res: Response) {
  const tags: unknown = req.body.tags;
  if (!validateTags(tags)) return res.status(400).json({ success: false, error: 'Tag không hợp lệ' });
  try {
    const product = await prisma.product.findUnique({ where: { id: String(req.params.id) } });
    if (!product) return res.status(404).json({ success: false, error: 'Không tìm thấy sản phẩm' });
    const specs = product.specs && typeof product.specs === 'object' && !Array.isArray(product.specs) ? product.specs : {};
    await prisma.product.update({ where: { id: product.id }, data: { specs: { ...specs, productTags: [...new Set(tags)] } } });
    await clearCachePattern('fogo_cache:*products*');
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ success: false, error: 'Không thể lưu tag' });
  }
}
