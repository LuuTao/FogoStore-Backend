"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductBySlug = exports.filterProducts = exports.getAllProducts = void 0;
const prisma_1 = require("../lib/prisma");
const getAllProducts = async (req, res) => {
    try {
        const products = await prisma_1.prisma.product.findMany({
            include: { category: true, variants: true }
        });
        return res.json({ success: true, data: products });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
exports.getAllProducts = getAllProducts;
const filterProducts = async (req, res) => {
    try {
        const { category, isFeatured, isFlashSale, isHot } = req.query;
        const whereClause = {};
        if (category) {
            whereClause.category = { slug: String(category).toLowerCase() };
        }
        if (isFeatured === 'true')
            whereClause.isFeatured = true;
        if (isFlashSale === 'true')
            whereClause.isFlashSale = true;
        if (isHot === 'true')
            whereClause.isHot = true;
        const products = await prisma_1.prisma.product.findMany({
            where: whereClause,
            include: { category: true, variants: true },
            orderBy: { createdAt: 'desc' },
        });
        return res.json({ success: true, data: products });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};
exports.filterProducts = filterProducts;
const getProductBySlug = async (req, res) => {
    try {
        const rawSlug = decodeURIComponent(String(req.params.slug || '')).trim();
        const proid = req.query.proid ? String(req.query.proid).trim() : '';
        const cleanBaseSlug = rawSlug.replace(/(-(8gb|16gb|24gb|32gb|64gb|128gb|256gb|512gb|1tb|2tb|40mm|41mm|42mm|44mm|45mm|46mm|49mm))+$/gi, '');
        let product = null;
        // 1. Ưu tiên tìm chính xác theo proid (ID sản phẩm gốc)
        if (proid) {
            product = await prisma_1.prisma.product.findUnique({
                where: { id: proid },
                include: { category: true, variants: true },
            });
        }
        // 2. Tìm theo cleanBaseSlug hoặc rawSlug
        if (!product) {
            product = await prisma_1.prisma.product.findFirst({
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
            const variant = await prisma_1.prisma.productVariant.findFirst({
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
            let imgs = v.images;
            if (typeof imgs === 'string') {
                try {
                    imgs = JSON.parse(imgs);
                }
                catch {
                    imgs = [imgs];
                }
            }
            return {
                ...v,
                images: Array.isArray(imgs) ? imgs : [],
            };
        });
        return res.json({ success: true, data: { ...product, variants: parsedVariants } });
    }
    catch (err) {
        console.error('Lỗi lấy chi tiết sản phẩm:', err);
        return res.status(500).json({ success: false, error: 'Lỗi server' });
    }
};
exports.getProductBySlug = getProductBySlug;
