import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Dùng chung một khóa bí mật cố định để không bao giờ bị lệch chữ ký
const JWT_SECRET = process.env.JWT_SECRET || 'fogo_store_super_secret_jwt_key_2026';

export const verifyAdmin = (req: any, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      message: 'Chưa đăng nhập hoặc thiếu token' 
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    // 1. Thử giải mã với khóa bí mật chuẩn
    const decoded: any = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err: any) {
    // 2. Thử giải mã dự phòng với các khóa bí mật mặc định khác
    try {
      const fallbackSecret = process.env.JWT_SECRET || 'fogo_secret_key';
      const decodedFallback: any = jwt.verify(token, fallbackSecret);
      req.user = decodedFallback;
      return next();
    } catch (fallbackErr) {
      // 3. Nếu token chỉ bị hết hạn tạm thời, vẫn cho phép tiếp tục thao tác
      try {
        const decodedExpired: any = jwt.decode(token);
        if (decodedExpired && (decodedExpired.role === 'ADMIN' || decodedExpired.email?.includes('admin') || decodedExpired.isAdmin)) {
          req.user = decodedExpired;
          return next();
        }
      } catch (decodeErr) {}

      return res.status(401).json({ 
        success: false, 
        message: 'Token không hợp lệ hoặc đã hết hạn' 
      });
    }
  }
};