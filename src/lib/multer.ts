import multer from 'multer';
import path from 'path';
import fs from 'fs';

export const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình lưu trữ vào ổ cứng với tên file an toàn
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // Chuẩn hóa và làm sạch đuôi mở rộng file
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, 'fogo-' + uniqueSuffix + ext);
  },
});

// Bộ lọc định dạng hình ảnh nghiêm ngặt (kiểm tra cả MimeType lẫn phần mở rộng đuôi file)
const imageFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file định dạng hình ảnh an toàn (.jpg, .jpeg, .png, .webp, .gif)!'));
  }
};

// Bộ lọc cho file Excel (khi import dữ liệu sản phẩm)
const excelFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'text/csv', // .csv
  ];
  const allowedExts = ['.xlsx', '.xls', '.csv'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file định dạng Excel (.xlsx, .xls) hoặc CSV!'));
  }
};

// 1. Upload hình ảnh: Giới hạn tối đa 5MB / file, chỉ cho phép ảnh hợp lệ
export const uploadImage = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB tối đa
    files: 10,                 // Tối đa 10 file cùng lúc
  },
});

// 2. Upload file chung: Giới hạn 10MB
export const uploadFile = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB tối đa
  },
});

// 3. Upload file Excel lưu vào RAM: Giới hạn 15MB, kiểm tra định dạng
export const uploadMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter: excelFileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB tối đa để bảo vệ RAM
    files: 1,
  },
});