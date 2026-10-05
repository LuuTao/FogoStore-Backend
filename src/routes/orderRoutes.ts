import { Router } from 'express';
import { 
  createOrder, 
  getOrderByCode, 
  getMyOrders,
  cancelOrderCustomer,
  updateOrderCustomer,
  getAllOrdersAdmin,
  updateOrderStatus,
  deleteOrder,
  deleteBulkOrders
} from '../controllers/orderController';
import { slidingWindowWithFreeze } from '../middlewares/rateLimiter';
import { optionalAuth, requireAuth, verifyAdmin } from '../lib/authMiddleware';

const router = Router();

// Giới hạn tạo đơn: Quá 5 lần / 60s -> Đóng băng 2.5 phút
const orderCheckoutLimiter = slidingWindowWithFreeze({
  windowSeconds: 60,
  maxRequests: 5,
  freezeSeconds: 150,
  eventType: 'SUSPICIOUS_ORDER_CREATION',
});

// Cho phép polling QR nhưng hạn chế việc dò hàng loạt mã đơn.
const orderAccessLimiter = slidingWindowWithFreeze({
  windowSeconds: 60,
  maxRequests: 60,
  freezeSeconds: 150,
  eventType: 'ORDER_ENUMERATION_ATTEMPT',
});

// ==========================================
// 1. ROUTE DÀNH CHO KHÁCH HÀNG & GUEST
// ==========================================
router.post('/', orderCheckoutLimiter, optionalAuth, createOrder);
router.get('/my-orders', requireAuth, getMyOrders);
// Endpoint polling trạng thái thanh toán của màn hình QR.
router.get('/:orderCode/status', orderAccessLimiter, optionalAuth, getOrderByCode);
router.get('/:orderCode', orderAccessLimiter, optionalAuth, getOrderByCode);
router.patch('/:orderCode/cancel', orderAccessLimiter, optionalAuth, cancelOrderCustomer);
router.patch('/:orderCode/update', orderAccessLimiter, optionalAuth, updateOrderCustomer);

// ==========================================
// 2. ROUTE QUẢN TRỊ VIÊN (ADMIN)
// ==========================================
router.get('/admin/orders', verifyAdmin, getAllOrdersAdmin);
router.patch('/admin/orders/:id/status', verifyAdmin, updateOrderStatus);
router.post('/admin/orders/bulk-delete', verifyAdmin, deleteBulkOrders);
router.delete('/admin/orders/:id', verifyAdmin, deleteOrder);

export default router;
