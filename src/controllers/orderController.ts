import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const createOrder = async (req: Request, res: Response) => {
  try {
    const { customerName, customerPhone, cartItems } = req.body;
    if (!customerName || !customerPhone || !cartItems?.length) {
      return res.status(400).json({ success: false, error: 'Thiếu thông tin đơn hàng' });
    }

    const subTotal = cartItems.reduce((s: number, i: any) => s + i.price * i.quantity, 0);
    const orderCode = `FG-${Math.floor(100000 + Math.random() * 900000)}`;

    const newOrder = await prisma.order.create({
      data: {
        orderCode,
        customerName,
        customerPhone,
        paymentMethod: req.body.paymentMethod || 'COD',
        subTotal,
        totalAmount: subTotal,
        items: {
          create: cartItems.map((i: any) => ({
            variantId: i.id,
            productName: i.name,
            storage: i.storage,
            color: i.color,
            price: i.price,
            quantity: i.quantity,
          })),
        },
      },
    });

    for (const item of cartItems) {
      try {
        const v = await prisma.productVariant.findUnique({ where: { id: item.id } });
        if (v?.productId) {
          await prisma.product.update({
            where: { id: v.productId },
            data: { soldQuantity: { increment: item.quantity } },
          });
        }
      } catch (e) {}
    }

    return res.status(201).json({ success: true, data: newOrder });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};