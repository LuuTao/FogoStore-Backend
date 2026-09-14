import { Router } from 'express';
import { createOrder, getOrderByCode, getMyOrders } from '../controllers/orderController';

const router = Router();

router.post('/', createOrder);
router.get('/my-orders', getMyOrders);
router.get('/:orderCode', getOrderByCode);

export default router;