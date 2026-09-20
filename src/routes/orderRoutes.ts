import { Router } from 'express';
import { 
  createOrder, 
  getOrderByCode, 
  getMyOrders,
  cancelOrderCustomer,
  getAllOrdersAdmin,
  updateOrderStatus,
  deleteOrder,
  deleteBulkOrders
} from '../controllers/orderController';

const router = Router();

// --- ROUTE DÀNH CHO KHÁCH HÀNG & GUEST ---
router.post('/', createOrder);
router.get('/my-orders', getMyOrders);
router.get('/:orderCode', getOrderByCode);
router.patch('/:orderCode/cancel', cancelOrderCustomer);

// --- ROUTE DÀNH CHO QUẢN TRỊ VIÊN (ADMIN) ---
router.get('/admin/orders', getAllOrdersAdmin);
router.patch('/admin/orders/:id/status', updateOrderStatus);
router.post('/admin/orders/bulk-delete', deleteBulkOrders);
router.delete('/admin/orders/:id', deleteOrder);

export default router;