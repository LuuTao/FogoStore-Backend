import { Router } from 'express';
import { 
  createOrder, 
  getOrderByCode, 
  getMyOrders,
  cancelOrderCustomer,
  updateOrderCustomer 
} from '../controllers/orderController';

const router = Router();

router.post('/', createOrder);
router.get('/my-orders', getMyOrders);
router.get('/:orderCode', getOrderByCode);
router.patch('/:orderCode/cancel', cancelOrderCustomer);
router.patch('/:orderCode/update', updateOrderCustomer);

export default router;