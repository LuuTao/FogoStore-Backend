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

const router = Router();

// ==========================================
// 1. ROUTE DÀNH CHO KHÁCH HÀNG & GUEST
// ==========================================
router.post('/', createOrder);
router.get('/my-orders', getMyOrders);
router.get('/:orderCode', getOrderByCode);
router.patch('/:orderCode/cancel', cancelOrderCustomer);
router.patch('/:orderCode/update', updateOrderCustomer);

// ==========================================
// 2. ROUTE QUẢN TRỊ VIÊN (ADMIN) - Khớp 100% yêu cầu xóa của Frontend
// ==========================================
router.get('/admin/orders', getAllOrdersAdmin);
router.patch('/admin/orders/:id/status', updateOrderStatus);

// ⚠️ Quan trọng: Đặt route bulk-delete TRƯỚC route :id để tránh Express hiểu nhầm
router.post('/admin/orders/bulk-delete', deleteBulkOrders);
router.delete('/admin/orders/:id', deleteOrder);

export default router;