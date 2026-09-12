"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBanners = exports.getPosts = void 0;
const prisma_1 = require("../lib/prisma");
const getPosts = async (req, res) => {
    const posts = await prisma_1.prisma.post.findMany({ orderBy: { createdAt: 'desc' } });
    return res.json({ success: true, data: posts });
};
exports.getPosts = getPosts;
const getBanners = async (req, res) => {
    const banners = await prisma_1.prisma.banner.findMany({ where: { isActive: true }, orderBy: { order: 'asc' } });
    return res.json({ success: true, data: banners });
};
exports.getBanners = getBanners;
