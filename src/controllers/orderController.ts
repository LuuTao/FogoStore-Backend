import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const createOrder = async (req: Request, res: Response) => {
  try {
    const {
      customerName,
      customerPhone,
      customerAddress,
      paymentMethod,
      note,
      cartItems,
    } = req.body;

    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ success: false, error: 'Giỏ hàng đang trống' });
    }

    // Tính tổng tiền an toàn (ép kiểu số tránh NaN hoặc null)
    const subTotal = cartItems.reduce(
      (sum: number, item: any) => sum + Number(item.price || 0) * Number(item.quantity || 1),
      0
    );

    const orderCode = `FG-${Math.floor(100000 + Math.random() * 900000)}`;

    const orderData: any = {
      orderCode,
      customerName: customerName || 'Khách lẻ',
      customerPhone: customerPhone || '',
      paymentMethod: paymentMethod || 'COD',
      note: note || '',
      subTotal,
      totalAmount: subTotal,
      orderStatus: 'PENDING',
      paymentStatus: 'PENDING',
      // Gán vào trường tương ứng của schema:
      storeAddress: customerAddress || '',
      items: {
        create: cartItems.map((item: any) => ({
          variantId: item.variantId || null,
          productName: item.productName || item.name || 'Sản phẩm',
          storage: item.storage || 'Tiêu chuẩn',
          color: item.color || 'Mặc định',
          price: Number(item.price || 0),
          quantity: Number(item.quantity || 1),
          imageUrl: item.imageUrl || item.image || '',
        })),
      },
    };

    const newOrder = await prisma.order.create({
      data: orderData,
      include: {
        items: true,
      },
    });

    return res.status(201).json({ success: true, data: newOrder });
  } catch (error: any) {
    console.error('Lỗi tạo đơn hàng:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};