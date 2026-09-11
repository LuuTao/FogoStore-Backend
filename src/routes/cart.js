const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 1. LẤY TOÀN BỘ GIỎ HÀNG CỦA USER
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const items = await prisma.cartItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Lỗi tải giỏ hàng' });
  }
});

// 2. THÊM HOẶC TĂNG SỐ LƯỢNG VÀO GIỎ HÀNG
router.post('/add', async (req, res) => {
  try {
    const { userId, variantId, name, price, storage, color, imageUrl, quantity } = req.body;
    if (!userId || !variantId) {
      return res.status(400).json({ success: false, error: 'Thiếu userId hoặc variantId' });
    }

    const qtyToAdd = Number(quantity) || 1;

    // Kiểm tra món này đã có trong giỏ của user chưa
    const existing = await prisma.cartItem.findFirst({
      where: { userId, variantId: String(variantId) },
    });

    let result;
    if (existing) {
      result = await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + qtyToAdd },
      });
    } else {
      result = await prisma.cartItem.create({
        data: {
          userId,
          variantId: String(variantId),
          name: name || 'Sản phẩm Apple',
          price: Number(price) || 0,
          storage: storage || '',
          color: color || '',
          imageUrl: imageUrl || '',
          quantity: qtyToAdd,
        },
      });
    }

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Lỗi thêm giỏ hàng' });
  }
});

// 3. CẬP NHẬT SỐ LƯỢNG (Tăng/giảm ở trang giỏ hàng)
router.patch('/update-quantity', async (req, res) => {
  try {
    const { userId, variantId, quantity } = req.body;
    const newQty = Number(quantity);

    if (newQty <= 0) {
      await prisma.cartItem.deleteMany({
        where: { userId, variantId: String(variantId) },
      });
    } else {
      await prisma.cartItem.updateMany({
        where: { userId, variantId: String(variantId) },
        data: { quantity: newQty },
      });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Lỗi cập nhật' });
  }
});

// 4. XÓA 1 MÓN KHỎI GIỎ HÀNG
router.delete('/remove', async (req, res) => {
  try {
    const { userId, variantId } = req.body;
    await prisma.cartItem.deleteMany({
      where: { userId, variantId: String(variantId) },
    });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Lỗi xóa món' });
  }
});

// 5. XÓA SẠCH GIỎ HÀNG (Sau khi đặt đơn hàng thành công)
router.delete('/clear/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    await prisma.cartItem.deleteMany({
      where: { userId },
    });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Lỗi xóa giỏ hàng' });
  }
});

module.exports = router;