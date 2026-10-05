import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { releaseExpiredStockReservations } from './services/stockReservationService';
import { securityAudit } from './middlewares/securityAudit';

// Import Routes
import authRoutes from './routes/authRoutes';
import productRoutes from './routes/productRoutes';
import orderRoutes from './routes/orderRoutes';
import contentRoutes from './routes/contentRoutes';
import adminRoutes from './routes/adminRoutes';
import uploadRoutes from './routes/uploadRoutes';
import cartRoutes from './routes/cart';

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;
const uploadDir = path.join(__dirname, '../uploads');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('Thiếu JWT_SECRET an toàn (tối thiểu 32 ký tự). Server đã dừng để tránh chạy với khóa mặc định.');
}

// ============================================================================
// 1. CẤU HÌNH BẢO MẬT & NÉN TỐC ĐỘ (LUÔN ĐẶT ĐẦU TIÊN)
// ============================================================================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(compression());

const defaultOrigins = process.env.NODE_ENV === 'production'
  ? 'https://fogo-store.vercel.app'
  : 'https://fogo-store.vercel.app,http://localhost:3000,http://127.0.0.1:3000';
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || defaultOrigins)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin không được phép bởi CORS'));
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
    'x-security-token',
    'x-order-token',
    'x-order-phone',
  ],
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Cookie đăng nhập dùng SameSite=None trên production nên mọi request ghi dữ liệu
// từ trình duyệt phải có Origin nằm trong allowlist để chống CSRF.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  const cookieHeader = req.headers.cookie || '';
  const usesBrowserCredential = /(?:^|;\s*)fogo_(?:access|refresh|order_)/.test(cookieHeader);

  // Browser requests authenticated by cookies must always prove their origin.
  // Requests without cookies remain available for trusted server-to-server jobs.
  if (!origin) {
    if (!usesBrowserCredential) return next();
    return res.status(403).json({ success: false, message: 'Thiếu thông tin nguồn gửi yêu cầu.' });
  }
  if (allowedOrigins.has(origin)) return next();
  return res.status(403).json({ success: false, message: 'Nguồn gửi yêu cầu không được tin cậy.' });
});
app.use('/api', securityAudit);

app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, '../public')));

// ============================================================================
// 2. HEALTHCHECK TOÀN DIỆN (KIỂM TRA SERVER, POSTGRESQL VÀ UPSTASH REDIS)
// ============================================================================
app.get('/', (req, res) => res.send('<h1>Fogo Store API Server is running!</h1>'));

app.get(['/health', '/api/health'], async (req, res) => {
  const timestamp = new Date().toISOString();
  
  // 1. Kiểm tra trạng thái và đo độ trễ Upstash Redis
  let redisStatus = 'UNKNOWN';
  let redisLatency = 0;
  const startRedis = Date.now();

  try {
    const pingRes = await redis.ping();
    redisLatency = Date.now() - startRedis;
    redisStatus = pingRes === 'PONG' ? 'CONNECTED' : `UNEXPECTED_RESPONSE (${pingRes})`;
  } catch (err: any) {
    redisStatus = 'UNAVAILABLE';
  }

  // 2. Kiểm tra trạng thái và đo độ trễ PostgreSQL (Aiven)
  let dbStatus = 'UNKNOWN';
  let dbLatency = 0;
  const startDb = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - startDb;
    dbStatus = 'CONNECTED';
  } catch (err: any) {
    dbStatus = 'UNAVAILABLE';
  }

  const isHealthy = redisStatus === 'CONNECTED' && dbStatus === 'CONNECTED';

  return res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'HEALTHY' : 'DEGRADED',
    timestamp,
    uptimeSeconds: Math.floor(process.uptime()),
    services: {
      server: {
        status: 'ONLINE',
      },
      upstashRedis: {
        status: redisStatus,
        latencyMs: `${redisLatency}ms`,
      },
      postgresDatabase: {
        status: dbStatus,
        latencyMs: `${dbLatency}ms`,
      },
    },
  });
});

// ============================================================================
// 3. TẦNG BẢO VỆ TẦN SUẤT TOÀN CỤC (GLOBAL RATE LIMITER)
// ============================================================================
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Quá nhiều yêu cầu từ IP của bạn, vui lòng đợi 1 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', globalLimiter);

// ============================================================================
// 4. THEO DÕI LƯỢT TRUY CẬP (PAGE VIEW TRACKING)
// ============================================================================
app.use(async (req, res, next) => {
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
      .catch(() => {});
  }
  next();
});

// ============================================================================
// 5. ĐĂNG KÝ DANH SÁCH ROUTER API CHÍNH THỨC
// ============================================================================
// Menu cửa hàng là dữ liệu công khai. Không đặt dưới namespace /api/admin.
app.get('/api/menu', (req, res) => res.json({ success: true, data: [] }));

// Không cho trình duyệt/CDN lưu lại hồ sơ, giỏ hàng, đơn hàng hoặc dữ liệu quản trị.
app.use(['/api/auth', '/api/orders', '/api/cart', '/api/admin'], (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
  next();
});

app.use('/api', uploadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', contentRoutes);

app.use('/api', (_req, res) => {
  return res.status(404).json({ success: false, message: 'API không tồn tại.' });
});

// Không trả stack trace hoặc trang lỗi HTML ra client. Điều này cũng giúp frontend
// luôn nhận JSON khi Multer/CORS từ chối request.
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const isUploadError = error?.name === 'MulterError';
  const isCorsError = String(error?.message || '').includes('CORS');
  const status = isUploadError ? 400 : isCorsError ? 403 : 500;
  if (status === 500) console.error('Unhandled server error:', error);
  return res.status(status).json({
    success: false,
    message: isUploadError
      ? 'File tải lên vượt giới hạn hoặc không đúng cấu hình.'
      : isCorsError
        ? 'Tên miền gửi yêu cầu không được phép.'
        : 'Máy chủ không thể xử lý yêu cầu.',
  });
});

// ============================================================================
// 6. KHỞI ĐỘNG SERVER
// ============================================================================
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 FoGo Store Server đang hoạt động tại cổng ${PORT} (0.0.0.0)`);
  releaseExpiredStockReservations().catch((error) => console.error('Lỗi kiểm tra giữ kho khi khởi động:', error));
});

// Dọn các đơn QR quá hạn mỗi phút. updateMany trong service đảm bảo mỗi đơn
// chỉ được nhận hoàn kho một lần, kể cả khi có nhiều instance backend.
const stockReservationTimer = setInterval(() => {
  releaseExpiredStockReservations().catch((error) => console.error('Lỗi tự động hoàn kho:', error));
}, 60_000);
stockReservationTimer.unref();
