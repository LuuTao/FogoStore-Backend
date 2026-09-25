import { Router } from 'express';
import {
  getAllProducts,
  filterProducts,
  getProductBySlug,
  getCategories,
  deleteProductsBulk,
} from '../controllers/productController';
import { checkCache } from '../middlewares/cacheMiddleware';

const router = Router();

// 1. Các route tĩnh và bộ lọc (Cache 5 phút)
router.get('/filter', checkCache(300), filterProducts);
router.get('/categories', checkCache(3600), getCategories);
router.post('/bulk-delete', deleteProductsBulk);

// 2. Danh sách tất cả sản phẩm
router.get('/', checkCache(300), getAllProducts);
router.get('/products', checkCache(300), getAllProducts);

// 3. Chi tiết sản phẩm theo slug (đặt cuối cùng, Cache 10 phút)
router.get('/:slug', checkCache(600), getProductBySlug);
router.get('/products/:slug', checkCache(600), getProductBySlug);

export default router;