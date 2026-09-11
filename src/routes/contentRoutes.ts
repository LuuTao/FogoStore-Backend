import { Router } from 'express';
import { getPosts, getBanners } from '../controllers/contentController';

const router = Router();

router.get('/posts', getPosts);
router.get('/banners', getBanners);

export default router;