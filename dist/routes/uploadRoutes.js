"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = require("../lib/multer");
const router = (0, express_1.Router)();
const PORT = process.env.PORT || 5000;
router.post('/upload', multer_1.uploadImage.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Vui lòng chọn một file hình ảnh' });
        }
        const imageUrl = `http://localhost:${PORT}/uploads/${req.file.filename}`;
        return res.json({ success: true, imageUrl, filename: req.file.filename });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});
router.post('/upload-multiple', multer_1.uploadImage.array('images', 10), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'Vui lòng chọn ít nhất một file ảnh' });
        }
        const uploadedImages = req.files.map((file) => ({
            filename: file.filename,
            imageUrl: `http://localhost:${PORT}/uploads/${file.filename}`,
            originalName: file.originalname,
        }));
        return res.json({ success: true, data: uploadedImages });
    }
    catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});
exports.default = router;
