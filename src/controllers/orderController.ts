import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const createOrder = async (req: Request, res: Response) => {
  try {
    const {
      customerName,
      customerPhone,
      customerEmail,
      gender,
      deliveryMethod,
      province,
      district,
      address,
      storeAddress,
      note,
      paymentMethod,
      subTotal,
      discountAmount,
      shippingFee,
      totalAmount,
      items,
      needVat,
      vatInfo,
    } = req.body;

    if (!customerName || !customerPhone || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Thiếu thông tin người nhận hoặc sản phẩm' });
    }

    const orderCode = `FG-${Math.floor(100000 + Math.random() * 900000)}`;

    const newOrder = await prisma.order.create({
      data: {
        orderCode,
        customerName,
        customerPhone,
        customerEmail: customerEmail || null,
        gender: gender || 'anh',
        // ✅ Cung cấp giá trị mặc định nếu client không truyền
        deliveryMethod: deliveryMethod || 'HOME_DELIVERY',
        province: province || '',
        district: district || '',
        address: address || '',
        storeAddress: storeAddress || '',
        note: note || '',
        paymentMethod: paymentMethod || 'COD',
        paymentStatus: 'PENDING',
        orderStatus: 'CONFIRMED',
        subTotal: Number(subTotal || totalAmount || 0),
        discountAmount: Number(discountAmount || 0),
        shippingFee: Number(shippingFee || 0),
        totalAmount: Number(totalAmount || subTotal || 0),
        needVat: Boolean(needVat),
        vatInfo: vatInfo || undefined,
        items: {
          create: items.map((item: any) => ({
            // Nếu không có variantId hợp lệ, lấy id hoặc để chuỗi trống/giá trị hợp lệ
            variantId: String(item.variantId || item.id || 'default-variant'),
            productName: String(item.name || item.productName || 'Sản phẩm'),
            storage: String(item.storage || 'Tiêu chuẩn'),
            color: String(item.color || 'Mặc định'),
            price: Number(item.price || 0),
            quantity: Number(item.quantity || 1),
            imageUrl: String(item.imageUrl || item.image || ''),
          })),
        },
      },
      include: { items: true },
    });

    return res.status(201).json({
      success: true,
      message: 'Đặt hàng thành công!',
      data: newOrder,
    });
  } catch (error: any) {
    console.error('Lỗi tạo đơn hàng:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};