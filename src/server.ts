import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { prisma } from './lib/prisma';

// Import Routes
import authRoutes from './routes/authRoutes';
import productRoutes from './routes/productRoutes';
import orderRoutes from './routes/orderRoutes';
import contentRoutes from './routes/contentRoutes';
import adminRoutes from './routes/adminRoutes';
import uploadRoutes from './routes/uploadRoutes';
import cartRoutes from './routes/cart';

dotenv.config();

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;
const uploadDir = path.join(__dirname, '../uploads');

// ============================================================================
// 1. CẤU HÌNH BẢO MẬT & NÉN TỐC ĐỘ (LUÔN ĐẶT ĐẦU TIÊN)
// ============================================================================
// Chống rò rỉ header, clickjacking, cho phép tải ảnh từ uploads
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Nén dữ liệu Gzip / Brotli
app.use(compression());

// Cấu hình CORS
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'Pragma',
    'Expires',
    'x-security-token', // Bổ sung header cho bảo mật lớp 2
  ],
};
app.use(cors(corsOptions));

// Bộ giải mã dữ liệu Request Body
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, '../public')));

// ============================================================================
// 2. HEALTHCHECK (ĐẶT TRƯỚC RATE LIMIT ĐỂ CRON-JOB PING THOẢI MÁI KHÔNG BỊ CHẶN)
// ============================================================================
app.get('/', (req, res) => res.send('<h1>Fogo Store API Server is running!</h1>'));
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', uptime: process.uptime(), timestamp: new Date().toISOString() });
});
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ============================================================================
// 3. TẦNG BẢO VỆ TẦN SUẤT TOÀN CỤC (GLOBAL RATE LIMITER)
// ============================================================================
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 phút
  max: 200, // Cho phép tối đa 200 request / phút / IP cho khách lướt web
  message: { success: false, message: 'Quá nhiều yêu cầu từ IP của bạn, vui lòng đợi 1 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', globalLimiter);

// Giới hạn chống dò mật khẩu cổng đăng nhập cơ bản
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Quá nhiều lần thử đăng nhập, vui lòng thử lại sau 15 phút.' },
});
app.use('/api/auth/', authLimiter);

// ============================================================================
// 4. THEO DÕI LƯỢT TRUY CẬP (PAGE VIEW TRACKING)
// ============================================================================
app.use(async (req, res, next) => {
  // Chỉ đếm lượt GET xem trang của người dùng thực, bỏ qua ảnh, file tĩnh và ping healthcheck
  if (
    req.method === 'GET' &&
    !req.path.startsWith('/uploads') &&
    !req.path.includes('.') &&
    !req.path.includes('health')
  ) {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      '';

    prisma.pageView
      .create({
        data: {
          ip: clientIp,
          userAgent: req.headers['user-agent'] || '',
          path: req.path,
        },
      })
      .catch(() => {}); // Chạy nền ngầm để không làm chậm luồng API chính
  }
  next();
});

// ============================================================================
// 5. ĐĂNG KÝ DANH SÁCH ROUTER API CHÍNH THỨC
// ============================================================================
app.get('/api/admin/menu', (req, res) => res.json({ success: true, data: [] }));

app.use('/api', uploadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', contentRoutes);

// Khởi động lắng nghe cổng mạng
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 FoGo Store Server đang hoạt động tại cổng ${PORT} (0.0.0.0)`);
});