import { Router } from 'express';
import { uploadFile, uploadMemory, uploadImage } from '../lib/multer';
import { verifyAdmin } from '../lib/authMiddleware';
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
  importHaravanPosts,
  createBannersBulk,
  deleteBanner,
  cleanupCategories,
  getSubCategories,
  upsertSubCategory,
  deleteSubCategory,
  getCustomers
} from '../controllers/adminController';
import { getPosts, getBanners, syncBanners } from '../controllers/contentController';
import { getAllOrdersAdmin, updateOrderStatusAdmin } from '../controllers/adminController';
import { getTrafficAnalytics } from '../controllers/adminController';

const router = Router();

// 1. Quản trị sản phẩm & Biến thể tồn kho
router.get('/inventory', getInventory);
// Hỗ trợ cả 2 endpoint để frontend gọi /inventory/:id hay /variants/:id đều update mượt mà
router.put('/inventory/:id', updateVariant);
router.delete('/inventory/:id', deleteVariant);

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

// 5. Quản lý Banners & Posts cho Admin (Tránh lỗi 404 khi Admin fetch dữ liệu)
router.get('/banners', getBanners);
router.post('/banners/sync', syncBanners);
router.post('/banners/bulk', createBannersBulk);
router.delete('/banners/:id', deleteBanner);
router.get('/posts', getPosts);
// Routes đơn hàng Admin
router.get('/orders', getAllOrdersAdmin);
router.patch('/orders/:id/status', updateOrderStatusAdmin);

router.get('/analytics', getAnalytics);

router.get('/customers', getCustomers);

router.get('/traffic-analytics', getTrafficAnalytics);
router.use(verifyAdmin);
export default router;