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

// Cấu hình CORS tương thích Express 5 & chuẩn preflight
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    callback(null, true); // Cho phép mọi domain kết nối an toàn kèm credentials
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

// 1. Áp dụng CORS cho toàn bộ request & tự động xử lý OPTIONS preflight
app.use(cors(corsOptions));

// 2. Parser dữ liệu dung lượng lớn (Base64 ảnh)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 3. Static file uploads & public
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, '../public')));

// 4. Route kiểm tra trạng thái máy chủ
app.get('/', (req, res) => res.send('<h1>Fogo Store API Server is running!</h1>'));
app.get('/api/health', (req, res) =>
  res.json({ status: 'OK', message: 'Fogo Store API Server is running!' })
);

// 5. Đăng ký toàn bộ API endpoints
app.use('/api', uploadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api', contentRoutes);
app.use('/api/admin', adminRoutes);

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server Backend đang chạy tại cổng ${PORT} (sẵn sàng nhận kết nối từ mọi thiết bị)`);
});