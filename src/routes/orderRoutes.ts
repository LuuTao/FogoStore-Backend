import { Router } from 'express';
import { 
  createOrder, 
  getOrderByCode, 
  getMyOrders,
  cancelOrderCustomer,
  updateOrderCustomer, // Đã có đủ hàm chỉnh sửa
  getAllOrdersAdmin,
  updateOrderStatus,
  deleteOrder,
  deleteBulkOrders
} from '../controllers/orderController';

const router = Router();

// --- ROUTE DÀNH CHO KHÁCH HÀNG & GUEST ---
router.post('/', createOrder);
router.get('/my-orders', getMyOrders); // Đặt trước các route có tham số động

// Các route có tham số động :orderCode
router.get('/:orderCode', getOrderByCode);
router.patch('/:orderCode/cancel', cancelOrderCustomer);
router.patch('/:orderCode/update', updateOrderCustomer); // Bổ sung chuẩn endpoint chỉnh sửa thông tin

// --- ROUTE DÀNH CHO QUẢN TRỊ VIÊN (ADMIN) ---
router.get('/admin/orders', getAllOrdersAdmin);
router.patch('/admin/orders/:id/status', updateOrderStatus);
router.post('/admin/orders/bulk-delete', deleteBulkOrders);
router.delete('/admin/orders/:id', deleteOrder);

export default router;