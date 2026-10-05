import crypto from 'crypto';
import fs from 'fs/promises';
import { NextFunction, Request, Response } from 'express';

const uploadedFiles = (req: Request): Express.Multer.File[] => {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') return Object.values(req.files).flat();
  return [];
};

const cloudinaryConfig = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
};

// Khi có đủ biến môi trường Cloudinary, ảnh được đưa ra object storage và file tạm
// được xóa. Nếu chưa cấu hình, hệ thống giữ cơ chế local hiện tại để không làm gián đoạn admin.
export const persistUploadedImages = async (req: Request, res: Response, next: NextFunction) => {
  const config = cloudinaryConfig();
  const files = uploadedFiles(req);
  if (!config || files.length === 0) return next();

  try {
    for (const file of files) {
      const timestamp = Math.floor(Date.now() / 1000);
      const folder = 'fogo-store';
      const signature = crypto
        .createHash('sha1')
        .update(`folder=${folder}&timestamp=${timestamp}${config.apiSecret}`)
        .digest('hex');
      const bytes = await fs.readFile(file.path);
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: file.mimetype }), file.originalname);
      form.append('api_key', config.apiKey);
      form.append('timestamp', String(timestamp));
      form.append('folder', folder);
      form.append('signature', signature);

      const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
        method: 'POST',
        body: form,
      });
      const result = await response.json() as { secure_url?: string; error?: { message?: string } };
      if (!response.ok || !result.secure_url) {
        throw new Error(result.error?.message || 'Object storage từ chối file ảnh.');
      }
      (file as any).publicUrl = result.secure_url;
      await fs.unlink(file.path).catch(() => {});
    }
    return next();
  } catch (error: any) {
    await Promise.all(files.map((file) => fs.unlink(file.path).catch(() => {})));
    return res.status(502).json({ success: false, error: `Không thể lưu ảnh an toàn: ${error.message}` });
  }
};
