import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// 1. Lấy danh sách giỏ hàng của user
router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    // Truy vấn giỏ hàng từ Database thông qua Prisma
    const cartItems = await prisma.cartItem.findMany({
      where: { userId: String(userId) },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: cartItems });
  } catch (err: any) {
    console.error('Lỗi lấy giỏ hàng:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Thêm sản phẩm vào giỏ hàng
router.post('/add', async (req: Request, res: Response) => {
  try {
    const { userId, variantId, name, price, storage, color, imageUrl, quantity } = req.body;

    if (!userId || !variantId) {
      return res.status(400).json({ success: false, error: 'Thiếu thông tin userId hoặc variantId' });
    }

    // Kiểm tra xem sản phẩm (với đúng phân loại dung lượng/màu) đã có trong giỏ hàng chưa
    const existingItem = await prisma.cartItem.findFirst({
      where: {
        userId: String(userId),
        variantId: String(variantId),
        storage: storage || '',
        color: color || '',
      },
    });

    let cartItem;
    if (existingItem) {
      // Nếu đã có thì cộng dồn số lượng
      cartItem = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: existingItem.quantity + (Number(quantity) || 1) },
      });
    } else {
      // Nếu chưa có thì tạo mới bản ghi
      cartItem = await prisma.cartItem.create({
        data: {
          userId: String(userId),
          variantId: String(variantId),
          name: name || 'Sản phẩm Apple',
          price: Number(price) || 0,
          storage: storage || '',
          color: color || '',
          imageUrl: imageUrl || '',
          quantity: Number(quantity) || 1,
        },
      });
    }

    return res.json({ success: true, data: cartItem });
  } catch (err: any) {
    console.error('Lỗi thêm vào giỏ hàng:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Cập nhật số lượng sản phẩm trong giỏ hàng
router.patch('/update-quantity', async (req: Request, res: Response) => {
  try {
    const { userId, variantId, storage, color, quantity } = req.body;

    const existingItem = await prisma.cartItem.findFirst({
      where: {
        userId: String(userId),
        variantId: String(variantId),
        storage: storage || '',
        color: color || '',
      },
    });

    if (!existingItem) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy sản phẩm trong giỏ hàng' });
    }

    const updated = await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity: Number(quantity) || 1 },
    });

    return res.json({ success: true, data: updated });
  } catch (err: any) {
    console.error('Lỗi cập nhật số lượng:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Xóa một sản phẩm khỏi giỏ hàng
router.delete('/remove', async (req: Request, res: Response) => {
  try {
    const { userId, variantId, storage, color } = req.body;

    const existingItem = await prisma.cartItem.findFirst({
      where: {
        userId: String(userId),
        variantId: String(variantId),
        storage: storage || '',
        color: color || '',
      },
    });

    if (existingItem) {
      await prisma.cartItem.delete({
        where: { id: existingItem.id },
      });
    }

    return res.json({ success: true, message: 'Đã xóa sản phẩm khỏi giỏ hàng' });
  } catch (err: any) {
    console.error('Lỗi xóa sản phẩm khỏi giỏ hàng:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Xóa toàn bộ giỏ hàng của user
router.delete('/clear/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    await prisma.cartItem.deleteMany({
      where: { userId: String(userId) },
    });

    return res.json({ success: true, message: 'Đã làm trống giỏ hàng' });
  } catch (err: any) {
    console.error('Lỗi làm trống giỏ hàng:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;