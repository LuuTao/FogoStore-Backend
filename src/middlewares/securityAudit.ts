import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

// Mẫu Regex nhận diện các mẫu payload tấn công
const SQLI_PATTERNS = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC)\b)|(['"]\s*(OR|AND)\s*['"]?\d+['"]?\s*=\s*['"]?\d+)|(--|#|\/\*)/i;
const XSS_PATTERNS = /(<script\b[^>]*>([\s\S]*?)<\/script>)|(<img\b[^>]*\bonerror\b)|(javascript:)|(onerror\s*=)|(onload\s*=)|(<iframe)/i;
const PATH_TRAVERSAL_PATTERNS = /(\.\.\/|\.\.\\|\/\.env|\/etc\/passwd|\/proc\/|wp-admin|wp-login|\.git)/i;

export const securityAudit = async (req: Request, res: Response, next: NextFunction) => {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'Unknown IP';
  const userAgent = req.headers['user-agent'] || 'Unknown User-Agent';
  const path = req.originalUrl || req.url;
  const method = req.method;

  const rawPayload = JSON.stringify({
    query: req.query,
    params: req.params,
    body: req.body,
  });

  let detectedThreat: { type: string; level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' } | null = null;

  // 1. Quét Path Traversal & Quét cổng/đường dẫn nhạy cảm
  if (PATH_TRAVERSAL_PATTERNS.test(path)) {
    detectedThreat = { type: 'PATH_TRAVERSAL_SCAN', level: 'HIGH' };
  }
  // 2. Quét mẫu SQL Injection trong URL hoặc Payload
  else if (SQLI_PATTERNS.test(rawPayload) || SQLI_PATTERNS.test(path)) {
    detectedThreat = { type: 'SQL_INJECTION_ATTEMPT', level: 'CRITICAL' };
  }
  // 3. Quét mã độc XSS
  else if (XSS_PATTERNS.test(rawPayload)) {
    detectedThreat = { type: 'XSS_ATTEMPT', level: 'HIGH' };
  }

  // Nếu phát hiện dấu hiệu bất thường -> Ghi log cảnh báo & chặn request
  if (detectedThreat) {
    console.error(`🚨 [SECURITY ALERT - ${detectedThreat.level}] IP: ${ip} | Type: ${detectedThreat.type} | Path: ${path}`);
    
    // Lưu vào Neon DB bất đồng bộ (không làm nghẽn luồng)
    prisma.securityLog.create({
      data: {
        ip,
        method,
        path,
        threatLevel: detectedThreat.level,
        eventType: detectedThreat.type,
        payload: rawPayload.slice(0, 2000), // Cắt ngắn để tối ưu bộ nhớ
        userAgent,
      }
    }).catch(err => console.error('Lỗi lưu log bảo mật:', err));

    return res.status(403).json({
      success: false,
      message: 'Yêu cầu của bạn bị từ chối do vi phạm quy tắc an toàn bảo mật hệ thống.',
    });
  }

  next();
};