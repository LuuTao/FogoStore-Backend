import { Router } from 'express';
import { getPosts, getBanners, syncBanners } from '../controllers/contentController';

const router = Router();

// Routes công khai cho trang chủ
router.get('/posts', getPosts);
router.get('/banners', getBanners);
router.post('/banners/sync', syncBanners);

export default router;