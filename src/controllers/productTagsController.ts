import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { clearCachePattern } from '../middlewares/cacheMiddleware';

const MAX_PRODUCT_TAGS = 8;
const MAX_PRODUCT_TAG_LENGTH = 40;

export function normalizeProductTags(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_PRODUCT_TAGS) return null;

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const rawTag of value) {
    if (typeof rawTag !== 'string') return null;
    const tag = rawTag.replace(/\s+/g, ' ').trim();
    if (!tag || tag.length > MAX_PRODUCT_TAG_LENGTH || /[<>\u0000-\u001F\u007F]/.test(tag)) return null;
    const key = tag.toLocaleLowerCase('vi-VN');
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(tag);
    }
  }
  return normalized;
}

export function validateTags(value: unknown): value is string[] {
  return normalizeProductTags(value) !== null;
}

export async function updateProductTags(req: Request, res: Response) {
  const tags: unknown = req.body.tags;
  const normalizedTags = normalizeProductTags(tags);
  if (!normalizedTags) {
    return res.status(400).json({
      success: false,
      error: `Tag không hợp lệ. Tối đa ${MAX_PRODUCT_TAGS} tag, mỗi tag không quá ${MAX_PRODUCT_TAG_LENGTH} ký tự.`,
    });
  }
  try {
    const product = await prisma.product.findUnique({ where: { id: String(req.params.id) } });
    if (!product) return res.status(404).json({ success: false, error: 'Không tìm thấy sản phẩm' });
    const specs = product.specs && typeof product.specs === 'object' && !Array.isArray(product.specs) ? product.specs : {};
    await prisma.product.update({ where: { id: product.id }, data: { specs: { ...specs, productTags: normalizedTags } } });
    await clearCachePattern('fogo_cache:*');
    return res.json({ success: true, data: { tags: normalizedTags } });
  } catch {
    return res.status(500).json({ success: false, error: 'Không thể lưu tag' });
  }
}
