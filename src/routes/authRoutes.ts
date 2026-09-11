import { Router } from 'express';
import { sendZaloOtp, verifyZaloOtp, login, googleAuth } from '../controllers/authController';

const router = Router();

router.post('/send-zalo-otp', sendZaloOtp);
router.post('/verify-zalo-otp', verifyZaloOtp);
router.post('/login', login);
router.post('/google', googleAuth);

export default router;