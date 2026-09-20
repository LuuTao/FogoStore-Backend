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
// A. ROUTE DÀNH CHO KHÁCH HÀNG & GUEST
// ==========================================
router.post('/', createOrder);
router.get('/my-orders', getMyOrders);
router.get('/:orderCode', getOrderByCode);
router.patch('/:orderCode/cancel', cancelOrderCustomer);
router.patch('/:orderCode/update', updateOrderCustomer);

// ==========================================
// B. ROUTE QUẢN TRỊ ĐƠN HÀNG (ADMIN)
// Lưu ý: Đặt prefix /admin/orders trực tiếp ở đây
// ==========================================
router.get('/admin/orders', getAllOrdersAdmin);
router.patch('/admin/orders/:id/status', updateOrderStatus);
router.post('/admin/orders/bulk-delete', deleteBulkOrders); // Đặt TRƯỚC route :id
router.delete('/admin/orders/:id', deleteOrder);

export default router;