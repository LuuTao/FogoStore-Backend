import { Router } from 'express';
import { createOrder, getOrderByCode } from '../controllers/orderController';

const router = Router();

router.post('/', createOrder);
router.get('/:orderCode', getOrderByCode);

export default router;