"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Import Routes
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const productRoutes_1 = __importDefault(require("./routes/productRoutes"));
const orderRoutes_1 = __importDefault(require("./routes/orderRoutes"));
const contentRoutes_1 = __importDefault(require("./routes/contentRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const uploadRoutes_1 = __importDefault(require("./routes/uploadRoutes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
const uploadDir = path_1.default.join(__dirname, '../uploads');
// Middlewares
app.use((0, cors_1.default)({
    origin: '*',
    credentials: true
}));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express_1.default.static(uploadDir));
// Route cơ bản & Kiểm tra trạng thái máy chủ
app.get('/', (req, res) => res.send('<h1>Fogo Store API Server is running!</h1>'));
app.get('/api/health', (req, res) => res.json({ status: 'OK', message: 'Fogo Store API Server is running!' }));
// Đăng ký toàn bộ API endpoints
app.use('/api', uploadRoutes_1.default); // /api/upload, /api/upload-multiple
app.use('/api/auth', authRoutes_1.default); // /api/auth/login, /api/auth/send-zalo-otp,...
app.use('/api/products', productRoutes_1.default); // /api/products, /api/products/filter, /api/products/:slug
app.use('/api/orders', orderRoutes_1.default); // /api/orders
app.use('/api', contentRoutes_1.default); // /api/posts, /api/banners
app.use('/api/admin', adminRoutes_1.default); // /api/admin/inventory, /api/admin/analytics,...
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server Backend đang chạy tại cổng ${PORT} (sẵn sàng nhận kết nối từ mọi thiết bị)`);
});
