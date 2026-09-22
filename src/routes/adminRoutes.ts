import { Router } from 'express';
import { uploadFile, uploadMemory, uploadImage } from '../lib/multer';
import { verifyAdmin } from '../lib/authMiddleware';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';
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
  getCustomers,
  getAllOrdersAdmin,
  updateOrderStatusAdmin,
  getTrafficAnalytics,
} from '../controllers/adminController';
import { getPosts, getBanners, syncBanners } from '../controllers/contentController';

const router = Router();

// ============================================================================
// BẮT BUỘC: ĐẶT verifyAdmin Ở ĐÂY ĐỂ BẢO VỆ 100% CÁC ROUTE PHÍA DƯỚI
// ============================================================================
router.use(verifyAdmin);

// 1. Quản trị sản phẩm & Biến thể tồn kho
router.get('/inventory', getInventory);
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

// 5. Quản lý Banners & Posts cho Admin
router.get('/banners', getBanners);
router.post('/banners/sync', syncBanners);
router.post('/banners/bulk', createBannersBulk);
router.delete('/banners/:id', deleteBanner);
router.get('/posts', getPosts);

// 6. Quản lý đơn hàng Admin
router.get('/orders', getAllOrdersAdmin);
router.patch('/orders/:id/status', updateOrderStatusAdmin);

// 7. Thống kê & Phân tích truy cập
router.get('/analytics', getAnalytics);
router.get('/customers', getCustomers);
router.get('/traffic-analytics', getTrafficAnalytics);

// 1. API Xác thực mật khẩu cấp 2 riêng biệt
router.post('/security-auth', async (req, res) => {
  const { email, password } = req.body;
  const targetEmail = process.env.SECURITY_LOG_EMAIL || 'tao6a3lt@gmail.com';
  const targetPass = process.env.SECURITY_LOG_PASSWORD || 'MatKhauRiengCuaBan@2026';

  if (email !== targetEmail || password !== targetPass) {
    return res.status(401).json({
      success: false,
      message: 'Tài khoản hoặc mật khẩu lớp 2 không chính xác!',
    });
  }

  // Cấp Token riêng có thời hạn ngắn (30 phút)
  const securityToken = jwt.sign(
    { email, scope: 'SECURITY_LOG_ACCESS' },
    process.env.JWT_SECRET || 'fogo_secret_key',
    { expiresIn: '30m' }
  );

  return res.json({
    success: true,
    securityToken,
    message: 'Xác thực bảo mật thành công!',
  });
});

// Middleware kiểm tra token cấp 2 trước khi mở log
const verifySecurityScope = (req: any, res: any, next: any) => {
  const secHeader = req.headers['x-security-token'];
  if (!secHeader) {
    return res.status(403).json({
      success: false,
      message: 'Bạn chưa vượt qua lớp bảo mật xác thực chuyên biệt.',
    });
  }

  try {
    const decoded: any = jwt.verify(secHeader, process.env.JWT_SECRET || 'fogo_secret_key');
    if (decoded.scope !== 'SECURITY_LOG_ACCESS' || decoded.email !== (process.env.SECURITY_LOG_EMAIL || 'tao6a3lt@gmail.com')) {
      return res.status(403).json({ success: false, message: 'Quyền truy cập không hợp lệ!' });
    }
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Phiên lớp 2 đã hết hạn!' });
  }
};

// 2. Gắn verifySecurityScope vào route xem log
router.get('/security-logs', verifySecurityScope, async (req, res) => {
  try {
    const logs = await prisma.securityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const stats = {
      total: logs.length,
      critical: logs.filter((l) => l.threatLevel === 'CRITICAL').length,
      high: logs.filter((l) => l.threatLevel === 'HIGH').length,
      sqli: logs.filter((l) => l.eventType === 'SQL_INJECTION_ATTEMPT').length,
      xss: logs.filter((l) => l.eventType === 'XSS_ATTEMPT').length,
    };

    return res.json({ success: true, data: { logs, stats } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Gắn verifySecurityScope vào route xóa log
router.delete('/security-logs', verifySecurityScope, async (req, res) => {
  try {
    await prisma.securityLog.deleteMany({});
    return res.json({ success: true, message: 'Đã dọn dẹp sạch log bảo mật!' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;