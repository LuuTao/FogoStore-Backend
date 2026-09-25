import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';

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
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(compression());

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
    'x-security-token',
  ],
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
    redisStatus = `ERROR: ${err.message || 'Disconnected'}`;
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
    dbStatus = `ERROR: ${err.message || 'Disconnected'}`;
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
app.get('/api/admin/menu', (req, res) => res.json({ success: true, data: [] }));

app.use('/api', uploadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', contentRoutes);

// ============================================================================
// 6. KHỞI ĐỘNG SERVER
// ============================================================================
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 FoGo Store Server đang hoạt động tại cổng ${PORT} (0.0.0.0)`);
});