import { Router } from 'express';
import { uploadFile } from '../lib/multer';
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
} from '../controllers/adminController';

const router = Router();

// Kho hàng & Biến thể
router.get('/inventory', getInventory);
router.post('/inventory/variant', addVariant);
router.put('/inventory/:id', updateVariant);
router.patch('/inventory/:variantId', patchVariant);
router.delete('/inventory/:variantId', deleteVariant);

// Sản phẩm
router.post('/products/full', createFullProduct);
router.delete('/products/:id', deleteProduct);
router.post('/products/import-excel', uploadFile.single('file'), importExcel);

// Đơn hàng & Thống kê
router.get('/analytics', getAnalytics);
router.get('/orders', getAdminOrders);
router.patch('/orders/:id/status', updateOrderStatus);

// Bài viết & Banner
router.post('/posts/import-haravan', uploadFile.single('file'), importHaravanPosts);
router.post('/banners/bulk', createBannersBulk);
router.delete('/banners/:id', deleteBanner);

export default router;