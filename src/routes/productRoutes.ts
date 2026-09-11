import { Router } from 'express';
import { getAllProducts, filterProducts, getProductBySlug } from '../controllers/productController';

const router = Router();

router.get('/', getAllProducts);
router.get('/filter', filterProducts);
router.get('/:slug', getProductBySlug);

export default router;