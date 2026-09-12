import { Router } from 'express';
import { uploadFile, uploadMemory, uploadImage } from '../lib/multer';
import {
  getInventory,
  createFullProduct,
  deleteProduct,
  addVariant,
  updateVariant,
  patchVariant,
  deleteVariant,
  importExcel,
  getAnalytics,
  getAdminOrders,
  updateOrderStatus,
  importHaravanPosts,
  createBannersBulk,
  deleteBanner,
  cleanupCategories,
  getSubCategories,
  upsertSubCategory,
  deleteSubCategory,
} from '../controllers/adminController';
import { syncBanners } from '../controllers/contentController';

const router = Router();

// 1. Quản trị sản phẩm & Biến thể
router.get('/inventory', getInventory);
router.post('/products/full', uploadImage.array('images', 8), createFullProduct);
router.delete('/products/:id', deleteProduct);
router.post('/variants', uploadImage.single('image'), addVariant);
router.put('/variants/:id', uploadImage.array('images', 8), updateVariant);
router.patch('/variants/:variantId', patchVariant);
router.delete('/variants/:variantId', deleteVariant);

// 2. Import Excel & Haravan
router.post('/products/import-excel', uploadMemory.single('file'), importExcel);
router.post('/posts/import-haravan', uploadFile.single('file'), importHaravanPosts);

// 3. Dọn dẹp danh mục rác cũ
router.get('/categories/cleanup', cleanupCategories);
router.delete('/categories/cleanup', cleanupCategories);

// 4. Quản lý SubCategory (Icon lọc tròn dòng máy)
router.get('/subcategories', getSubCategories);
router.post('/subcategories', upsertSubCategory);
router.delete('/subcategories/:id', deleteSubCategory);

// 5. Banners & Đơn hàng & Thống kê
router.post('/banners/bulk', createBannersBulk);
router.delete('/banners/:id', deleteBanner);
router.get('/orders', getAdminOrders);
router.patch('/orders/:id', updateOrderStatus);
router.get('/analytics', getAnalytics);
router.post('/banners/sync', syncBanners);

export default router;