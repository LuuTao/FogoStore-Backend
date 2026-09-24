import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { uploadFile, uploadMemory, uploadImage } from '../lib/multer';
import { verifyAdmin } from '../lib/authMiddleware';
import { prisma } from '../lib/prisma';
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

import { 
  getPosts, 
  createPost, 
  updatePost, 
  deletePost, 
  deletePostsBulk, 
  getBanners, 
  syncBanners,
  importPostsFromFile,
} from '../controllers/contentController';

const router = Router();

// ============================================================================
// 1. ROUTE CÔNG KHAI ADMIN: ĐỌC DỮ LIỆU & AUTH LỚP 2
// ============================================================================
router.post('/security-auth', async (req, res) => {
  try {
    const { email, password } = req.body;
    const targetEmail = process.env.SECURITY_LOG_EMAIL || 'tao6a3lt@gmail.com';
    const targetPass = process.env.SECURITY_LOG_PASSWORD || 'Tao30092004@';

    if (email !== targetEmail || password !== targetPass) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản hoặc mật khẩu lớp 2 không chính xác!',
      });
    }

    const securityToken = jwt.sign(
      { email, scope: 'SECURITY_LOG_ACCESS' },
      process.env.JWT_SECRET || 'fogo_secret_key',
      { expiresIn: '2h' }
    );

    return res.json({
      success: true,
      securityToken,
      message: 'Xác thực bảo mật thành công!',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Các route đọc dữ liệu bảng điều khiển (Không chặn token để tránh trắng trang)
router.get('/inventory', getInventory);
router.get('/orders', getAllOrdersAdmin);
router.get('/customers', getCustomers);
router.get('/analytics', getAnalytics);
router.get('/traffic-analytics', getTrafficAnalytics);
router.get('/banners', getBanners);
router.get('/posts', getPosts);
router.get('/subcategories', getSubCategories);

// Cập nhật và Xóa đơn hàng trực tiếp
router.patch('/orders/:id/status', updateOrderStatusAdmin);
router.put('/orders/:id/status', updateOrderStatusAdmin);
router.delete('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.orderItem.deleteMany({ where: { orderId: id } });
    await prisma.order.delete({ where: { id } });
    return res.json({ success: true, message: 'Đã xóa đơn hàng thành công!' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// 2. KÍCH HOẠT verifyAdmin BẢO VỆ CÁC THAO TÁC QUẢN TRỊ
// ============================================================================
router.use(verifyAdmin);

// Quản trị bài viết CMS (Thêm, Sửa, Xóa, Xóa hàng loạt, Import Excel/Word)
// Route upload ảnh bài viết / tin tức
router.post('/upload-image', uploadImage.single('image'), (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Chưa có file ảnh được tải lên!' });
    }
    // Trả về đường dẫn ảnh vừa upload
    const imageUrl = `/uploads/${req.file.filename}`;
    return res.json({ success: true, imageUrl, message: 'Tải ảnh lên thành công!' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});
router.post('/posts', createPost);
router.put('/posts/:id', updatePost);
router.delete('/posts/:id', deletePost);
router.post('/posts/bulk-delete', deletePostsBulk);
router.post('/posts/import', uploadFile.single('file'), importPostsFromFile);
router.post('/posts/import-haravan', uploadFile.single('file'), importPostsFromFile);

// Quản trị biến thể & sản phẩm
router.put('/inventory/:id', updateVariant);
router.delete('/inventory/:id', deleteVariant);
router.post('/products/full', uploadImage.array('images', 8), createFullProduct);
router.delete('/products/:id', deleteProduct);
router.post('/variants', uploadImage.single('image'), addVariant);
router.put('/variants/:id', uploadImage.array('images', 8), updateVariant);
router.patch('/variants/:variantId', patchVariant);
router.delete('/variants/:variantId', deleteVariant);

// Import Sản phẩm Excel
router.post('/products/import-excel', uploadMemory.single('file'), importExcel);

// Danh mục & SubCategory
router.get('/categories/cleanup', cleanupCategories);
router.delete('/categories/cleanup', cleanupCategories);
router.post('/subcategories', upsertSubCategory);
router.delete('/subcategories/:id', deleteSubCategory);

// Banner
router.post('/banners/sync', syncBanners);
router.post('/banners/bulk', createBannersBulk);
router.delete('/banners/:id', deleteBanner);

// ============================================================================
// 3. ROUTE LOG BẢO MẬT (YÊU CẦU TOKEN LỚP 2: x-security-token)
// ============================================================================
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
    if (decoded.scope !== 'SECURITY_LOG_ACCESS') {
      return res.status(403).json({ success: false, message: 'Quyền truy cập không hợp lệ!' });
    }
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Phiên lớp 2 đã hết hạn!' });
  }
};

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

router.delete('/security-logs', verifySecurityScope, async (req, res) => {
  try {
    await prisma.securityLog.deleteMany({});
    return res.json({ success: true, message: 'Đã dọn dẹp sạch log bảo mật!' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;