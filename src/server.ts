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

// Middlewares
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(uploadDir));

// Route cơ bản & Kiểm tra trạng thái máy chủ
app.get('/', (req, res) => res.send('<h1>Fogo Store API Server is running!</h1>'));
app.get('/api/health', (req, res) => res.json({ status: 'OK', message: 'Fogo Store API Server is running!' }));

// Đăng ký toàn bộ API endpoints
app.use('/api', uploadRoutes);             // /api/upload, /api/upload-multiple
app.use('/api/auth', authRoutes);          // /api/auth/login, /api/auth/send-zalo-otp,...
app.use('/api/products', productRoutes);   // /api/products, /api/products/filter, /api/products/:slug
app.use('/api/orders', orderRoutes);       // /api/orders
app.use('/api', contentRoutes);            // /api/posts, /api/banners
app.use('/api/admin', adminRoutes);        // /api/admin/inventory, /api/admin/analytics,...

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server Backend đang chạy tại cổng ${PORT} (sẵn sàng nhận kết nối từ mọi thiết bị)`);
});