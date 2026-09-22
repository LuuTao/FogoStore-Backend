import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import compression from 'compression';
import { prisma } from './lib/prisma';
// Import Routes
import authRoutes from './routes/authRoutes';
import productRoutes from './routes/productRoutes';
import orderRoutes from './routes/orderRoutes';
import contentRoutes from './routes/contentRoutes';
import adminRoutes from './routes/adminRoutes';
import uploadRoutes from './routes/uploadRoutes';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cartRoutes from './routes/cart';
import { getTrafficAnalytics } from './controllers/adminController';
dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;
const uploadDir = path.join(__dirname, '../uploads');

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
  ],
};

app.use(cors(corsOptions));

// 1. Bật nén Gzip/Brotli lên đầu để tối ưu tốc độ truyền tải mạng
app.use(compression());

// 2. Parser dữ liệu dung lượng lớn (Base64 ảnh)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 3. Static file uploads & public
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, '../public')));

// 4. Route kiểm tra trạng thái máy chủ & Health check chống ngủ đông
app.get('/', (req, res) => res.send('<h1>Fogo Store API Server is running!</h1>'));
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/api/admin/menu', (req, res) => res.json({ success: true, data: [] }));

// 5. Đăng ký toàn bộ API endpoints
app.use('/api', uploadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api', contentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api', orderRoutes);

app.use(async (req, res, next) => {
  // Bỏ qua các file tĩnh hoặc options request
  if (req.method === 'GET' && !req.path.startsWith('/uploads') && !req.path.includes('.')) {
    try {
      await prisma.pageView.create({
        data: {
          ip: req.ip || req.socket.remoteAddress || '',
          userAgent: req.headers['user-agent'] || '',
          path: req.path,
        },
      });
    } catch {
      // Tránh block request nếu ghi log lỗi
    }
  }
  next();
});

// 1. Chống rò rỉ thông tin Header & Clickjacking
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" } // Đảm bảo load được ảnh từ thư mục uploads
}));

// 2. Rate Limiting toàn cục: Tối đa 150 request / phút / IP
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 150,
  message: { success: false, message: 'Quá nhiều yêu cầu từ IP của bạn, vui lòng đợi 1 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', globalLimiter);

// 3. Giới hạn nghiêm ngặt với các thao tác đặt hàng / auth (chống brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Quá nhiều lần thử đăng nhập/đặt hàng, vui lòng thử lại sau 15 phút.' },
});
app.use('/api/auth/', authLimiter);

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server Backend đang chạy tại cổng ${PORT} (sẵn sàng nhận kết nối từ mọi thiết bị)`);
});