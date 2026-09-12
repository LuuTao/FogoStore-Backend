"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const contentController_1 = require("../controllers/contentController");
const router = (0, express_1.Router)();
router.get('/posts', contentController_1.getPosts);
router.get('/banners', contentController_1.getBanners);
exports.default = router;
