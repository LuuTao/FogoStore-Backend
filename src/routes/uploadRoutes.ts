import { Router } from 'express';
import { uploadImage } from '../lib/multer';
import { verifyAdmin } from '../lib/authMiddleware';
import { validateUploadedImages } from '../middlewares/validateUploadedImages';
import { persistUploadedImages } from '../middlewares/persistUploadedImages';

const router = Router();

router.post('/upload', verifyAdmin, uploadImage.single('image'), validateUploadedImages, persistUploadedImages, (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Vui lòng chọn file hình ảnh' });
    }
    const relativeUrl = req.file.publicUrl || `/uploads/${req.file.filename}`;
    return res.json({ success: true, imageUrl: relativeUrl, filename: req.file.filename });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/upload-multiple', verifyAdmin, uploadImage.array('images', 10), validateUploadedImages, persistUploadedImages, (req: any, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'Vui lòng chọn ít nhất một file ảnh' });
    }
    const uploadedImages = req.files.map((file: any) => ({
      filename: file.filename,
      imageUrl: file.publicUrl || `/uploads/${file.filename}`,
      originalName: file.originalname,
    }));
    return res.json({ success: true, data: uploadedImages });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
