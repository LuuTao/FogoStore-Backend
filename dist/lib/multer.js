"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadMemory = exports.uploadFile = exports.uploadImage = exports.uploadDir = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
exports.uploadDir = path_1.default.join(__dirname, '../../uploads');
if (!fs_1.default.existsSync(exports.uploadDir)) {
    fs_1.default.mkdirSync(exports.uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, exports.uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path_1.default.extname(file.originalname);
        cb(null, 'fogo-' + uniqueSuffix + ext);
    },
});
exports.uploadImage = (0, multer_1.default)({ storage });
exports.uploadFile = (0, multer_1.default)({ dest: exports.uploadDir });
// Thêm cấu hình lưu vào RAM cho việc đọc Excel bằng ExcelJS
exports.uploadMemory = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
