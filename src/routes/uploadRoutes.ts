import { Router } from 'express';
import { uploadImage } from '../lib/multer';

const router = Router();
const PORT = process.env.PORT || 5000;

router.post('/upload', uploadImage.single('image'), (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Vui lòng chọn một file hình ảnh' });
    }
    const imageUrl = `http://localhost:${PORT}/uploads/${req.file.filename}`;
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
    const uploadedImages = req.files.map((file: any) => ({
      filename: file.filename,
      imageUrl: `http://localhost:${PORT}/uploads/${file.filename}`,
      originalName: file.originalname,
    }));
    return res.json({ success: true, data: uploadedImages });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;