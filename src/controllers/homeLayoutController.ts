import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { clearCachePattern } from '../middlewares/cacheMiddleware';

const homeLayout = (prisma as any).homeLayout;

export const DEFAULT_HOME_SECTIONS = [
  { id: 'hero', enabled: true },
  { id: 'flash-sale', enabled: true },
  { id: 'categories', enabled: true },
  { id: 'iphone', enabled: true },
  { id: 'ipad', enabled: true },
  { id: 'macbook', enabled: true },
  { id: 'commitment', enabled: true },
  { id: 'news', enabled: true },
];

const normalizeSections = (value: unknown) => {
  if (!Array.isArray(value)) return DEFAULT_HOME_SECTIONS;

  const knownIds = new Set(DEFAULT_HOME_SECTIONS.map((section) => section.id));
  const seen = new Set<string>();
  const normalized = value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const id = String((item as { id?: unknown }).id || '');
    if (!knownIds.has(id) || seen.has(id)) return [];
    seen.add(id);
    return [{ id, enabled: (item as { enabled?: unknown }).enabled !== false }];
  });

  DEFAULT_HOME_SECTIONS.forEach((section) => {
    if (!seen.has(section.id)) normalized.push(section);
  });
  return normalized;
};

export const getHomeLayout = async (_req: Request, res: Response) => {
  try {
    const config = await homeLayout.findUnique({ where: { id: 'HOME' } });
    return res.json({
      success: true,
      data: { id: 'HOME', sections: normalizeSections(config?.sections) },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateHomeLayout = async (req: Request, res: Response) => {
  try {
    const sections = normalizeSections(req.body.sections);
    const config = await homeLayout.upsert({
      where: { id: 'HOME' },
      create: { id: 'HOME', sections },
      update: { sections },
    });
    clearCachePattern('fogo_cache:*').catch(() => {});
    return res.json({ success: true, data: { ...config, sections } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
