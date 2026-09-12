import { Router } from 'express';
import { uploadImage } from '../lib/multer';

const router = Router();

// Ưu tiên biến môi trường SERVER_URL / RENDER_EXTERNAL_URL (Render tự sinh), nếu không có thì trỏ về domain Render thật
const getBaseUrl = (req: any) => {
  if (process.env.SERVER_URL) return process.env.SERVER_URL.replace(/\/$/, '');
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  
  // Khi chạy production trên Render
  if (process.env.NODE_ENV === 'production') {
    return 'https://fogo-store-api.onrender.com';
  }

  // Khi chạy localhost ở máy
  return `${req.protocol}://${req.get('host')}`;
};

router.post('/upload', uploadImage.single('image'), (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Vui lòng chọn một file hình ảnh' });
    }
    const baseUrl = getBaseUrl(req);
    const imageUrl = `${baseUrl}/uploads/${req.file.filename}`;
    return res.json({ success: true, imageUrl, filename: req.file.filename });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/upload-multiple', uploadImage.array('images', 10), (req: any, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'Vui lòng chọn ít nhất một file ảnh' });
    }
    const baseUrl = getBaseUrl(req);
    const uploadedImages = req.files.map((file: any) => ({
      filename: file.filename,
      imageUrl: `${baseUrl}/uploads/${file.filename}`,
      originalName: file.originalname,
    }));
    return res.json({ success: true, data: uploadedImages });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;