import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Import Routes
import authRoutes from './routes/authRoutes';
import productRoutes from './routes/productRoutes';
import orderRoutes from './routes/orderRoutes';
import contentRoutes from './routes/contentRoutes';
import adminRoutes from './routes/adminRoutes';
import uploadRoutes from './routes/uploadRoutes';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;
const uploadDir = path.join(__dirname, '../uploads');

// Danh sách các domain Frontend được phép kết nối
const allowedOrigins = [
  'https://fogo-store.vercel.app',
  'https://fogo-store-nfw3.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Cho phép các tool test API không gửi origin (như Postman/Curl) hoặc các domain trong danh sách
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(null, true); // Fallback mở cho mọi domain trong giai đoạn phát triển
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
};

// Middlewares
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Xử lý triệt để toàn bộ preflight OPTIONS requests

// Cho phép truyền payload dung lượng lớn (Base64 ảnh)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file uploads & public
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, '../public')));

// Route kiểm tra trạng thái máy chủ
app.get('/', (req, res) => res.send('<h1>Fogo Store API Server is running!</h1>'));
app.get('/api/health', (req, res) =>
  res.json({ status: 'OK', message: 'Fogo Store API Server is running!' })
);

// Đăng ký toàn bộ API endpoints
app.use('/api', uploadRoutes);             // /api/upload, /api/upload-multiple
app.use('/api/auth', authRoutes);         // /api/auth/login, /api/auth/send-email-otp,...
app.use('/api/products', productRoutes);  // /api/products, /api/products/filter,...
app.use('/api/orders', orderRoutes);      // /api/orders
app.use('/api', contentRoutes);           // /api/posts, /api/banners
app.use('/api/admin', adminRoutes);       // /api/admin/inventory, /api/admin/banners,...

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server Backend đang chạy tại cổng ${PORT} (sẵn sàng nhận kết nối từ mọi thiết bị)`);
});