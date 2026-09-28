export const PRODUCT_TAGS = ['Chính hãng', 'New Seal', 'Like New 99%', 'CPO'] as const;
export type TaggedProduct = { name?: string; specs?: unknown; category?: { name?: string; slug?: string } };
export function getProductTags(product: TaggedProduct): string[] {
  const specs = product.specs as { productTags?: unknown } | undefined;
  if (Array.isArray(specs?.productTags)) return specs.productTags.filter((tag): tag is string => typeof tag === 'string');
  const name = product.name || '';
  return PRODUCT_TAGS.filter((tag) => tag === 'Like New 99%' ? /like\s*new|99%/i.test(name) : new RegExp(tag.replace(' ', '\\s*'), 'i').test(name));
}
export function isUsedProduct(product: TaggedProduct): boolean {
  const tags = getProductTags(product);
  if (tags.includes('Like New 99%') || tags.includes('CPO')) return true;
  if (tags.includes('Chính hãng') || tags.includes('New Seal')) return false;
  return /cũ|like\s*new|99%|98%|\bcpo\b|hang-cu|iphone-cu|ipad-cu|macbook-cu/i.test([product.name, product.category?.name, product.category?.slug].join(' '));
}
