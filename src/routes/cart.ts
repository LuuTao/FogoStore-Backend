import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest, requireAuth } from '../lib/authMiddleware';

const router = Router();
router.use(requireAuth);

// 1. Lấy danh sách giỏ hàng của user
router.get('/:userId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
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
router.post('/add', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { variantId } = req.body;
    const quantity = Number(req.body.quantity || 1);

    if (!variantId || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      return res.status(400).json({ success: false, error: 'Sản phẩm hoặc số lượng không hợp lệ' });
    }

    const variant = await prisma.productVariant.findUnique({
      where: { id: String(variantId) },
      include: { product: true },
    });
    if (!variant || variant.stock < quantity) {
      return res.status(400).json({ success: false, error: 'Sản phẩm không tồn tại hoặc không đủ tồn kho' });
    }

    // Kiểm tra xem sản phẩm (với đúng phân loại dung lượng/màu) đã có trong giỏ hàng chưa
    const existingItem = await prisma.cartItem.findFirst({
      where: {
        userId: String(userId),
        variantId: String(variantId),
      },
    });

    let cartItem;
    if (existingItem) {
      const nextQuantity = existingItem.quantity + quantity;
      if (nextQuantity > 10 || nextQuantity > variant.stock) {
        return res.status(400).json({ success: false, error: 'Số lượng vượt quá tồn kho hoặc giới hạn mỗi đơn' });
      }
      // Nếu đã có thì cộng dồn số lượng
      cartItem = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: nextQuantity, price: variant.price },
      });
    } else {
      // Nếu chưa có thì tạo mới bản ghi
      cartItem = await prisma.cartItem.create({
        data: {
          userId: String(userId),
          variantId: String(variantId),
          name: variant.product.name,
          price: variant.price,
          storage: variant.storage || '',
          color: variant.color || '',
          imageUrl: variant.images[0] || '',
          quantity,
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
router.patch('/update-quantity', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { variantId } = req.body;
    const quantity = Number(req.body.quantity);
    if (!variantId || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      return res.status(400).json({ success: false, error: 'Số lượng không hợp lệ' });
    }

    const existingItem = await prisma.cartItem.findFirst({
      where: {
        userId: String(userId),
        variantId: String(variantId),
      },
    });

    if (!existingItem) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy sản phẩm trong giỏ hàng' });
    }

    const variant = await prisma.productVariant.findUnique({ where: { id: String(variantId) } });
    if (!variant || quantity > variant.stock) {
      return res.status(400).json({ success: false, error: 'Số lượng vượt quá tồn kho hiện tại' });
    }

    const updated = await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity, price: variant.price },
    });

    return res.json({ success: true, data: updated });
  } catch (err: any) {
    console.error('Lỗi cập nhật số lượng:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Xóa một sản phẩm khỏi giỏ hàng
router.delete('/remove', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { variantId } = req.body;

    const existingItem = await prisma.cartItem.findFirst({
      where: {
        userId: String(userId),
        variantId: String(variantId),
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
router.delete('/clear/:userId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

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
