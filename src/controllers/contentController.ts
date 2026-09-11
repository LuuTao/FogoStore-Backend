import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const getPosts = async (req: Request, res: Response) => {
  const posts = await prisma.post.findMany({ orderBy: { createdAt: 'desc' } });
  return res.json({ success: true, data: posts });
};

export const getBanners = async (req: Request, res: Response) => {
  const banners = await prisma.banner.findMany({ where: { isActive: true }, orderBy: { order: 'asc' } });
  return res.json({ success: true, data: banners });
};