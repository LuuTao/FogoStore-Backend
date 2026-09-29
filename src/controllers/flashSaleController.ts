import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { clearCachePattern } from '../middlewares/cacheMiddleware';

const flashSaleConfig = (prisma as any).flashSaleConfig;
const productDelegate = (prisma as any).product;
const productVariantDelegate = (prisma as any).productVariant;

const getStatus = (config: any) => {
  if (!config?.isActive || !config.startAt || !config.endAt) return 'INACTIVE';
  const now = Date.now();
  const startAt = new Date(config.startAt).getTime();
  const endAt = new Date(config.endAt).getTime();
  if (now < startAt) return 'UPCOMING';
  if (now > endAt) return 'ENDED';
  return 'ACTIVE';
};

const getConfig = async () => flashSaleConfig.findUnique({ where: { id: 'HOME' } });

export const getFlashSale = async (_req: Request, res: Response) => {
  try {
    const config = await getConfig();
    const products = await productDelegate.findMany({
      where: { variants: { some: { isFlashSale: true } } },
      include: {
        category: true,
        variants: {
          where: { isFlashSale: true },
          orderBy: [{ price: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ soldQuantity: 'desc' }, { updatedAt: 'desc' }],
    });

    return res.json({
      success: true,
      data: {
        config: config || {
          id: 'HOME',
          title: 'FLASH SALE GIÁ SỐC',
          startAt: null,
          endAt: null,
          isActive: false,
        },
        status: getStatus(config),
        products,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateFlashSaleConfig = async (req: Request, res: Response) => {
  try {
    const title = String(req.body.title || 'FLASH SALE GIÁ SỐC').trim();
    const startAt = req.body.startAt ? new Date(req.body.startAt) : null;
    const endAt = req.body.endAt ? new Date(req.body.endAt) : null;
    const isActive = Boolean(req.body.isActive);

    if (isActive && (!startAt || !endAt || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()))) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập đầy đủ ngày giờ bắt đầu và kết thúc' });
    }
    if (startAt && endAt && endAt <= startAt) {
      return res.status(400).json({ success: false, error: 'Thời gian kết thúc phải sau thời gian bắt đầu' });
    }

    const config = await flashSaleConfig.upsert({
      where: { id: 'HOME' },
      create: { id: 'HOME', title, startAt, endAt, isActive },
      update: { title, startAt, endAt, isActive },
    });
    clearCachePattern('fogo_cache:*').catch(() => {});
    return res.json({ success: true, data: { ...config, status: getStatus(config) } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateVariantFlashSale = async (req: Request, res: Response) => {
  try {
    const variant = await productVariantDelegate.update({
      where: { id: String(req.params.id) },
      data: { isFlashSale: Boolean(req.body.isFlashSale) },
      select: {
        id: true,
        storage: true,
        color: true,
        size: true,
        version: true,
        isFlashSale: true,
        product: { select: { id: true, name: true } },
      },
    });
    clearCachePattern('fogo_cache:*').catch(() => {});
    return res.json({ success: true, data: variant });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
