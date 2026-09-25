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

const router = Router();

// Giới hạn tạo đơn: Quá 5 lần / 60s -> Đóng băng 2.5 phút
const orderCheckoutLimiter = slidingWindowWithFreeze({
  windowSeconds: 60,
  maxRequests: 5,
  freezeSeconds: 150,
});

// ==========================================
// 1. ROUTE DÀNH CHO KHÁCH HÀNG & GUEST
// ==========================================
router.post('/', orderCheckoutLimiter, createOrder);
router.get('/my-orders', getMyOrders);
router.get('/:orderCode', getOrderByCode);
router.patch('/:orderCode/cancel', cancelOrderCustomer);
router.patch('/:orderCode/update', updateOrderCustomer);

// ==========================================
// 2. ROUTE QUẢN TRỊ VIÊN (ADMIN)
// ==========================================
router.get('/admin/orders', getAllOrdersAdmin);
router.patch('/admin/orders/:id/status', updateOrderStatus);
router.post('/admin/orders/bulk-delete', deleteBulkOrders);
router.delete('/admin/orders/:id', deleteOrder);

export default router;