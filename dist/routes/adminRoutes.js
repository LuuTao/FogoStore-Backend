"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = require("../lib/multer");
const adminController_1 = require("../controllers/adminController");
const router = (0, express_1.Router)();
// 1. Quản trị sản phẩm & Biến thể
router.get('/inventory', adminController_1.getInventory);
router.post('/products/full', multer_1.uploadImage.array('images', 8), adminController_1.createFullProduct);
router.delete('/products/:id', adminController_1.deleteProduct);
router.post('/variants', multer_1.uploadImage.single('image'), adminController_1.addVariant);
router.put('/variants/:id', multer_1.uploadImage.array('images', 8), adminController_1.updateVariant);
router.patch('/variants/:variantId', adminController_1.patchVariant);
router.delete('/variants/:variantId', adminController_1.deleteVariant);
// 2. Import Excel & Haravan
router.post('/products/import-excel', multer_1.uploadMemory.single('file'), adminController_1.importExcel);
router.post('/posts/import-haravan', multer_1.uploadFile.single('file'), adminController_1.importHaravanPosts);
// 3. Dọn dẹp danh mục rác cũ
router.get('/categories/cleanup', adminController_1.cleanupCategories);
router.delete('/categories/cleanup', adminController_1.cleanupCategories);
// 4. Quản lý SubCategory (Icon lọc tròn dòng máy)
router.get('/subcategories', adminController_1.getSubCategories);
router.post('/subcategories', adminController_1.upsertSubCategory);
router.delete('/subcategories/:id', adminController_1.deleteSubCategory);
// 5. Banners & Đơn hàng & Thống kê
router.post('/banners/bulk', adminController_1.createBannersBulk);
router.delete('/banners/:id', adminController_1.deleteBanner);
router.get('/orders', adminController_1.getAdminOrders);
router.patch('/orders/:id', adminController_1.updateOrderStatus);
router.get('/analytics', adminController_1.getAnalytics);
exports.default = router;
