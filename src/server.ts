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
import cartRoutes from './routes/cart'; // <-- BỔ SUNG IMPORT ROUTE GIỎ HÀNG

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
app.use('/api/cart', cartRoutes); // <-- BỔ SUNG ĐĂNG KÝ ENDPOINT /api/cart

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server Backend đang chạy tại cổng ${PORT} (sẵn sàng nhận kết nối từ mọi thiết bị)`);
});