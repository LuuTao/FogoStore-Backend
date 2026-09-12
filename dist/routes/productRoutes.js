"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const productController_1 = require("../controllers/productController");
const router = (0, express_1.Router)();
router.get('/', productController_1.getAllProducts);
router.get('/filter', productController_1.filterProducts);
router.get('/:slug', productController_1.getProductBySlug);
exports.default = router;
