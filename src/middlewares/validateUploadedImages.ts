import fs from 'fs/promises';
import { NextFunction, Request, Response } from 'express';

type ImageKind = 'jpeg' | 'png' | 'webp' | 'gif';

const detectImageKind = (buffer: Buffer): ImageKind | null => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) return 'gif';
  return null;
};

const expectedKind = (file: Express.Multer.File): ImageKind | null => {
  const mimeMap: Record<string, ImageKind> = {
    'image/jpeg': 'jpeg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return mimeMap[file.mimetype] || null;
};

const uploadedFiles = (req: Request): Express.Multer.File[] => {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') return Object.values(req.files).flat();
  return [];
};

export const validateUploadedImages = async (req: Request, res: Response, next: NextFunction) => {
  const files = uploadedFiles(req);
  if (files.length === 0) return next();

  try {
    for (const file of files) {
      const handle = await fs.open(file.path, 'r');
      const header = Buffer.alloc(16);
      await handle.read(header, 0, header.length, 0);
      await handle.close();
      const detected = detectImageKind(header);
      if (!detected || detected !== expectedKind(file)) {
        throw new Error(`File ${file.originalname} không phải ảnh hợp lệ hoặc đã bị giả mạo định dạng.`);
      }
    }
    return next();
  } catch (error: any) {
    await Promise.all(files.map((file) => fs.unlink(file.path).catch(() => {})));
    return res.status(400).json({
      success: false,
      error: error?.message || 'File ảnh không hợp lệ.',
    });
  }
};
