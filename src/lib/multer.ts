import multer from 'multer';
import path from 'path';
import fs from 'fs';

export const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'fogo-' + uniqueSuffix + ext);
  },
});

export const uploadImage = multer({ storage });
export const uploadFile = multer({ dest: uploadDir });