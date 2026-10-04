import { Router } from 'express';
import { getPosts, getBanners, syncBanners } from '../controllers/contentController';
import { getProductFaqs } from '../controllers/productFaqController';
import { getFlashSale } from '../controllers/flashSaleController';
import { getHomeLayout } from '../controllers/homeLayoutController';
import { checkCache } from '../middlewares/cacheMiddleware';

const router = Router();

// Routes công khai cho trang chủ
router.get('/posts', checkCache(300), getPosts);
router.get('/banners', checkCache(120), getBanners);
router.get('/product-faqs', checkCache(600), getProductFaqs);
router.get('/flash-sale', checkCache(15), getFlashSale);
router.get('/home-layout', checkCache(300), getHomeLayout);
router.post('/banners/sync', syncBanners);

export default router;
