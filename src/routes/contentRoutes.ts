import { Router } from 'express';
import { getPosts, getBanners, syncBanners } from '../controllers/contentController';
import { getProductFaqs } from '../controllers/productFaqController';
import { getFlashSale } from '../controllers/flashSaleController';

const router = Router();

// Routes công khai cho trang chủ
router.get('/posts', getPosts);
router.get('/banners', getBanners);
router.get('/product-faqs', getProductFaqs);
router.get('/flash-sale', getFlashSale);
router.post('/banners/sync', syncBanners);

export default router;
