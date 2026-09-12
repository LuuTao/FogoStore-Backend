"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBanner = exports.createBannersBulk = exports.importHaravanPosts = exports.updateOrderStatus = exports.getAdminOrders = exports.getAnalytics = exports.deleteSubCategory = exports.upsertSubCategory = exports.getSubCategories = exports.cleanupCategories = exports.importExcel = exports.deleteVariant = exports.patchVariant = exports.updateVariant = exports.addVariant = exports.deleteProduct = exports.createFullProduct = exports.getInventory = void 0;
const node_xlsx_1 = __importDefault(require("node-xlsx"));
const exceljs_1 = __importDefault(require("exceljs"));
const fs_1 = __importDefault(require("fs"));
const prisma_1 = require("../lib/prisma");
// 1. Tồn kho
const getInventory = async (req, res) => {
    try {
        const variants = await prisma_1.prisma.productVariant.findMany({
            include: {
                product: {
                    include: { category: true },
                },
            },
            orderBy: { stock: 'asc' },
        });
        return res.json({ success: true, data: variants });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};
exports.getInventory = getInventory;
// 2. Tạo sản phẩm đầy đủ kèm biến thể
const createFullProduct = async (req, res) => {
    try {
        const { name, categoryName, description, isFeatured, isFlashSale, isHot, variants } = req.body;
        if (!name || !categoryName || !variants || variants.length === 0) {
            return res.status(400).json({ success: false, error: 'Vui lòng nhập tên sản phẩm, danh mục và ít nhất 1 biến thể' });
        }
        let cat = await prisma_1.prisma.category.findFirst({ where: { name: categoryName } });
        if (!cat) {
            cat = await prisma_1.prisma.category.create({
                data: {
                    name: categoryName,
                    slug: categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                },
            });
        }
        const cleanSlug = name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        const newProduct = await prisma_1.prisma.product.create({
            data: {
                name,
                slug: `${cleanSlug}-${Date.now().toString().slice(-4)}`,
                description: description || `Mô tả chính hãng của ${name}`,
                categoryId: cat.id,
                isFeatured: Boolean(isFeatured),
                isFlashSale: Boolean(isFlashSale),
                isHot: Boolean(isHot),
                variants: {
                    create: variants.map((v) => ({
                        storage: v.storage,
                        color: v.color,
                        slug: `${v.storage.toLowerCase()}-${v.color.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-3)}`,
                        price: Number(v.price),
                        originalPrice: Number(v.originalPrice || v.price),
                        stock: Number(v.stock || 0),
                        images: v.imageUrl ? [v.imageUrl] : [],
                    })),
                },
            },
            include: { variants: true, category: true },
        });
        return res.status(201).json({ success: true, data: newProduct });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};
exports.createFullProduct = createFullProduct;
// 3. Xóa sản phẩm gốc
const deleteProduct = async (req, res) => {
    try {
        const id = req.params.id;
        await prisma_1.prisma.productVariant.deleteMany({ where: { productId: id } });
        await prisma_1.prisma.product.delete({ where: { id } });
        return res.json({ success: true, message: 'Đã xóa toàn bộ sản phẩm thành công' });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
exports.deleteProduct = deleteProduct;
// 4. Thêm biến thể cho sản phẩm sẵn có
const addVariant = async (req, res) => {
    try {
        const { productId, storage, color, price, originalPrice, stock, imageUrl } = req.body;
        if (!productId || !storage || !color || !price) {
            return res.status(400).json({ success: false, error: 'Vui lòng điền đủ thông tin bắt buộc' });
        }
        const variantSlug = `${storage.toLowerCase()}-${color.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`;
        const newVariant = await prisma_1.prisma.productVariant.create({
            data: {
                productId,
                storage,
                color,
                slug: variantSlug,
                price: Number(price),
                originalPrice: Number(originalPrice || price),
                stock: Number(stock || 0),
                images: imageUrl ? [imageUrl] : [],
            },
            include: { product: { include: { category: true } } },
        });
        return res.status(201).json({ success: true, data: newVariant });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};
exports.addVariant = addVariant;
// 5. Cập nhật biến thể
const updateVariant = async (req, res) => {
    try {
        const id = req.params.id;
        const { storage, color, price, originalPrice, stock, images } = req.body;
        let formattedImages = [];
        if (Array.isArray(images)) {
            formattedImages = images.filter((img) => typeof img === 'string' && img.trim() !== '');
        }
        else if (typeof images === 'string') {
            try {
                const parsed = JSON.parse(images);
                formattedImages = Array.isArray(parsed) ? parsed : [images];
            }
            catch {
                formattedImages = [images];
            }
        }
        const updated = await prisma_1.prisma.productVariant.update({
            where: { id },
            data: {
                ...(storage && { storage }),
                ...(color && { color }),
                ...(price !== undefined && { price: Number(price) }),
                ...(originalPrice !== undefined && { originalPrice: Number(originalPrice) }),
                ...(stock !== undefined && { stock: Number(stock) }),
                ...(formattedImages.length > 0 && { images: formattedImages }),
            },
        });
        return res.json({ success: true, data: updated });
    }
    catch (error) {
        console.error('Lỗi cập nhật biến thể:', error);
        return res.status(500).json({ success: false, error: 'Lỗi cập nhật biến thể' });
    }
};
exports.updateVariant = updateVariant;
// 6. Cập nhật nhanh tồn kho (PATCH)
const patchVariant = async (req, res) => {
    try {
        const { stock, price } = req.body;
        const updated = await prisma_1.prisma.productVariant.update({
            where: { id: req.params.variantId },
            data: {
                ...(stock !== undefined && { stock: Number(stock) }),
                ...(price !== undefined && { price: Number(price) }),
            },
        });
        return res.json({ success: true, data: updated });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};
exports.patchVariant = patchVariant;
// 7. Xóa biến thể lẻ
const deleteVariant = async (req, res) => {
    try {
        await prisma_1.prisma.productVariant.delete({ where: { id: req.params.variantId } });
        return res.json({ success: true, message: 'Đã xóa biến thể thành công' });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};
exports.deleteVariant = deleteVariant;
// 8. Import sản phẩm từ Excel
const importExcel = async (req, res) => {
    try {
        let fileBuffer = null;
        if (req.file?.buffer) {
            fileBuffer = req.file.buffer;
        }
        else if (req.file?.path && fs_1.default.existsSync(req.file.path)) {
            fileBuffer = fs_1.default.readFileSync(req.file.path);
            fs_1.default.unlinkSync(req.file.path);
        }
        if (!fileBuffer) {
            return res.status(400).json({ success: false, error: 'Chưa đính kèm file Excel hợp lệ' });
        }
        const workSheets = node_xlsx_1.default.parse(fileBuffer);
        if (!workSheets || workSheets.length === 0) {
            return res.status(400).json({ success: false, error: 'File Excel không có dữ liệu' });
        }
        const sheetData = workSheets[0].data;
        if (!sheetData || sheetData.length < 2) {
            return res.status(400).json({ success: false, error: 'Bảng tính rỗng hoặc thiếu dòng dữ liệu' });
        }
        const rawHeaders = sheetData[0].map((h) => (h ? h.toString().trim() : ''));
        let importedCount = 0;
        let variantCount = 0;
        for (let r = 1; r < sheetData.length; r++) {
            const row = sheetData[r];
            if (!row || row.length === 0)
                continue;
            const d = {};
            rawHeaders.forEach((header, index) => {
                if (header)
                    d[header] = row[index];
            });
            const fullName = (d['Tên'] || d['name'] || '').toString().trim();
            if (!fullName)
                continue;
            const storageMatch = fullName.match(/\b(\d+\s*(?:GB|TB)(\s*\/\s*\d+\s*(?:GB|TB))?)\b/i);
            const storage = storageMatch ? storageMatch[1].replace(/\s+/g, '').toUpperCase() : 'Tiêu chuẩn';
            const cleanName = fullName
                .replace(/\b(\d+\s*(?:GB|TB)(\s*\/\s*(?:\d+\s*)?(?:GB|TB))?)\b/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
            const rawCategory = (d['Loại sản phẩm'] || d['Danh Mục'] || d['category'] || '').toString().toLowerCase();
            const combinedText = `${rawCategory} ${fullName.toLowerCase()}`;
            const isUsed = combinedText.includes('cũ') || combinedText.includes('like new') || combinedText.includes('99%');
            let standardCategoryName = 'Phụ kiện';
            if (combinedText.includes('iphone')) {
                standardCategoryName = isUsed ? 'iPhone Cũ' : 'iPhone';
            }
            else if (combinedText.includes('macbook') || combinedText.includes('mac')) {
                standardCategoryName = isUsed ? 'MacBook Cũ' : 'MacBook';
            }
            else if (combinedText.includes('ipad')) {
                standardCategoryName = isUsed ? 'iPad Cũ' : 'iPad';
            }
            else if (combinedText.includes('watch')) {
                standardCategoryName = isUsed ? 'Watch Cũ' : 'Watch';
            }
            else if (combinedText.includes('pencil') ||
                combinedText.includes('keyboard') ||
                combinedText.includes('sạc') ||
                combinedText.includes('tai nghe') ||
                combinedText.includes('airpods') ||
                combinedText.includes('phụ kiện')) {
                standardCategoryName = 'Phụ kiện';
            }
            let cat = await prisma_1.prisma.category.findFirst({ where: { name: standardCategoryName } });
            if (!cat) {
                const catSlug = standardCategoryName
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[đĐ]/g, 'd')
                    .replace(/[^a-z0-9]+/g, '-');
                cat = await prisma_1.prisma.category.create({ data: { name: standardCategoryName, slug: catSlug } });
            }
            const parentSlug = cleanName
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[đĐ]/g, 'd')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
            let prod = await prisma_1.prisma.product.findUnique({ where: { slug: parentSlug } });
            if (!prod) {
                prod = await prisma_1.prisma.product.create({
                    data: {
                        name: cleanName,
                        slug: parentSlug,
                        categoryId: cat.id,
                        description: d['Mô tả'] || `Sản phẩm chính hãng ${cleanName} tại Fogo Store`,
                    },
                });
                importedCount++;
            }
            else {
                prod = await prisma_1.prisma.product.update({
                    where: { id: prod.id },
                    data: {
                        categoryId: cat.id,
                        description: d['Mô tả'] || prod.description,
                    },
                });
            }
            let color = d['Màu Sắc'] || d['color'] || 'Tiêu chuẩn';
            if (d['Thuộc tính 1'] === 'Color' && d['Giá trị thuộc tính 1'])
                color = d['Giá trị thuộc tính 1'];
            else if (d['Thuộc tính 2'] === 'Color' && d['Giá trị thuộc tính 2'])
                color = d['Giá trị thuộc tính 2'];
            else if (d['Thuộc tính 3'] === 'Color' && d['Giá trị thuộc tính 3'])
                color = d['Giá trị thuộc tính 3'];
            else if (d['Giá trị thuộc tính 1'])
                color = d['Giá trị thuộc tính 1'];
            const price = Number(d['Giá'] || d['Giá Bán'] || d['price'] || 0);
            const originalPrice = Number(d['Giá so sánh'] || d['Giá Gốc'] || price);
            const stock = Number(d['Số lượng tồn kho'] || d['Tồn Kho'] || 10);
            const imageUrl = (d['Ảnh biến thể'] || d['Link hình'] || d['Ảnh'] || '').toString().trim();
            const cleanColorSlug = color.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/[^a-z0-9]+/g, '-');
            const cleanStorageSlug = storage.toString().toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const variantSlug = `${parentSlug}-${cleanStorageSlug}-${cleanColorSlug}`;
            const existingVariant = await prisma_1.prisma.productVariant.findFirst({
                where: { productId: prod.id, slug: variantSlug },
            });
            if (existingVariant) {
                await prisma_1.prisma.productVariant.update({
                    where: { id: existingVariant.id },
                    data: {
                        price,
                        originalPrice,
                        stock,
                        images: imageUrl ? Array.from(new Set([...existingVariant.images, imageUrl])) : existingVariant.images,
                    },
                });
            }
            else {
                await prisma_1.prisma.productVariant.create({
                    data: {
                        productId: prod.id,
                        storage,
                        color,
                        slug: variantSlug,
                        price,
                        originalPrice,
                        stock,
                        images: imageUrl ? [imageUrl] : [],
                    },
                });
            }
            variantCount++;
        }
        return res.json({
            success: true,
            message: `Đã gom nhóm thành công! Tạo ${importedCount} dòng sản phẩm chính và ${variantCount} phiên bản biến thể dung lượng/màu.`,
        });
    }
    catch (err) {
        console.error('Lỗi Import Excel:', err);
        return res.status(500).json({ success: false, error: 'Lỗi xử lý file Excel: ' + err.message });
    }
};
exports.importExcel = importExcel;
// 9. Dọn dẹp danh mục rác cũ
const cleanupCategories = async (req, res) => {
    try {
        const validCategories = [
            'iPhone',
            'iPhone Cũ',
            'MacBook',
            'MacBook Cũ',
            'iPad',
            'iPad Cũ',
            'Watch',
            'Watch Cũ',
            'Phụ kiện',
        ];
        const deleted = await prisma_1.prisma.category.deleteMany({
            where: {
                name: {
                    notIn: validCategories,
                },
            },
        });
        return res.json({
            success: true,
            message: `Đã dọn dẹp thành công! Đã xóa ${deleted.count} danh mục rác cũ.`,
        });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
exports.cleanupCategories = cleanupCategories;
// 10. Quản lý SubCategory
const getSubCategories = async (req, res) => {
    try {
        const { categoryId } = req.query;
        const subs = await prisma_1.prisma.subCategory.findMany({
            where: categoryId ? { categoryId: String(categoryId) } : undefined,
            orderBy: { order: 'asc' },
            include: { category: true },
        });
        return res.json({ success: true, data: subs });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
exports.getSubCategories = getSubCategories;
const upsertSubCategory = async (req, res) => {
    try {
        const { id, name, categoryId, imageUrl, keyword, order } = req.body;
        if (!name || !categoryId) {
            return res.status(400).json({ success: false, error: 'Thiếu tên hoặc danh mục cha' });
        }
        const slug = name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[^a-z0-9]+/g, '-');
        if (id) {
            const updated = await prisma_1.prisma.subCategory.update({
                where: { id: id },
                data: {
                    name,
                    slug,
                    categoryId,
                    imageUrl,
                    keyword: keyword || name,
                    order: Number(order || 0),
                },
            });
            return res.json({ success: true, data: updated });
        }
        const created = await prisma_1.prisma.subCategory.create({
            data: {
                name,
                slug,
                categoryId,
                imageUrl,
                keyword: keyword || name,
                order: Number(order || 0),
            },
        });
        return res.status(201).json({ success: true, data: created });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
exports.upsertSubCategory = upsertSubCategory;
const deleteSubCategory = async (req, res) => {
    try {
        await prisma_1.prisma.subCategory.delete({ where: { id: req.params.id } });
        return res.json({ success: true, message: 'Đã xóa item lọc thành công' });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
exports.deleteSubCategory = deleteSubCategory;
// 11. Thống kê Analytics
const getAnalytics = async (req, res) => {
    try {
        const completedOrders = await prisma_1.prisma.order.findMany({
            where: { OR: [{ orderStatus: 'COMPLETED' }, { paymentStatus: 'PAID' }] },
        });
        const totalRevenue = completedOrders.reduce((sum, o) => sum + o.totalAmount, 0);
        const totalOrders = await prisma_1.prisma.order.count();
        const totalProducts = await prisma_1.prisma.product.count();
        const topSelling = await prisma_1.prisma.product.findMany({ take: 5, orderBy: { soldQuantity: 'desc' } });
        const last7Days = [...Array(7)].map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d.toISOString().split('T')[0];
        }).reverse();
        const revenueByDay = await Promise.all(last7Days.map(async (day) => {
            const start = new Date(`${day}T00:00:00.000Z`);
            const end = new Date(`${day}T23:59:59.999Z`);
            const orders = await prisma_1.prisma.order.findMany({
                where: { createdAt: { gte: start, lte: end }, OR: [{ orderStatus: 'COMPLETED' }, { paymentStatus: 'PAID' }] },
            });
            return { date: day, total: orders.reduce((s, o) => s + o.totalAmount, 0), ordersCount: orders.length };
        }));
        return res.json({ success: true, data: { totalRevenue, totalOrders, totalProducts, topSelling, revenueByDay } });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};
exports.getAnalytics = getAnalytics;
// 12. Quản lý đơn hàng
const getAdminOrders = async (req, res) => {
    try {
        const orders = await prisma_1.prisma.order.findMany({ include: { items: true }, orderBy: { createdAt: 'desc' } });
        return res.json({ success: true, data: orders });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
exports.getAdminOrders = getAdminOrders;
const updateOrderStatus = async (req, res) => {
    try {
        const { orderStatus, paymentStatus } = req.body;
        const updated = await prisma_1.prisma.order.update({
            where: { id: req.params.id },
            data: { ...(orderStatus && { orderStatus }), ...(paymentStatus && { paymentStatus }) },
        });
        return res.json({ success: true, data: updated });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
exports.updateOrderStatus = updateOrderStatus;
// 13. Import bài viết Haravan
const importHaravanPosts = async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ success: false, error: 'Chưa đính kèm file Haravan' });
        const workbook = new exceljs_1.default.Workbook();
        if (req.file.originalname?.endsWith('.csv'))
            await workbook.csv.readFile(req.file.path);
        else
            await workbook.xlsx.readFile(req.file.path);
        const worksheet = workbook.worksheets[0];
        const headers = {};
        worksheet.getRow(1).eachCell((cell, col) => { headers[col] = cell.value?.toString().trim(); });
        let count = 0;
        for (let r = 2; r <= worksheet.rowCount; r++) {
            const row = worksheet.getRow(r);
            if (!row.hasValues)
                continue;
            const d = {};
            row.eachCell((cell, col) => { if (headers[col])
                d[headers[col]] = cell.value; });
            const title = d['Title'] || d['Tiêu đề'] || d['Tên bài viết'];
            const rawHandle = d['Handle'] || d['Slug'] || d['Đường dẫn'];
            const content = d['Body (HTML)'] || d['Nội dung'] || d['Content'];
            const summary = d['Summary'] || d['Tóm tắt'] || '';
            const thumbnail = d['Image Src'] || d['Ảnh đại diện'] || '';
            if (!title)
                continue;
            const cleanSlug = (rawHandle || title).toLowerCase().replace(/[^a-z0-9]+/g, '-');
            await prisma_1.prisma.post.upsert({
                where: { slug: cleanSlug },
                update: { title, content: content || '', summary, thumbnail },
                create: { title, slug: cleanSlug, content: content || '', summary, thumbnail },
            });
            count++;
        }
        if (fs_1.default.existsSync(req.file.path))
            fs_1.default.unlinkSync(req.file.path);
        return res.json({ success: true, message: `Đã nhập thành công ${count} bài viết từ Haravan!` });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};
exports.importHaravanPosts = importHaravanPosts;
// 14. Quản lý Banners
const createBannersBulk = async (req, res) => {
    try {
        const { banners } = req.body;
        const created = await prisma_1.prisma.$transaction(banners.map((b, i) => prisma_1.prisma.banner.create({
            data: {
                title: b.title || `Banner ${i + 1}`,
                imageUrl: b.imageUrl,
                linkUrl: b.linkUrl || '/',
                position: b.position || 'HOME_TOP',
                order: Number(b.order ?? i),
            },
        })));
        return res.status(201).json({ success: true, data: created });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};
exports.createBannersBulk = createBannersBulk;
const deleteBanner = async (req, res) => {
    try {
        await prisma_1.prisma.banner.delete({ where: { id: req.params.id } });
        return res.json({ success: true, message: 'Đã xóa banner' });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};
exports.deleteBanner = deleteBanner;
