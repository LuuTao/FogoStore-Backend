import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const createOrder = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};

    // 1. Linh hoạt nhận cả fullName/name và phone/customerPhone
    const customerName = (body.customerName || body.fullName || body.name || body.buyerName || '').toString().trim();
    const customerPhone = (body.customerPhone || body.phone || body.phoneNumber || body.tel || '').toString().trim();
    const customerEmail = (body.customerEmail || body.email || '').toString().trim() || null;

    // 2. Linh hoạt nhận cả items / cartItems / products
    const rawItems = Array.isArray(body.items)
      ? body.items
      : Array.isArray(body.cartItems)
      ? body.cartItems
      : Array.isArray(body.products)
      ? body.products
      : [];

    if (!customerName) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập họ và tên người nhận' });
    }

    if (!customerPhone) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập số điện thoại người nhận' });
    }

    if (rawItems.length === 0) {
      return res.status(400).json({ success: false, error: 'Giỏ hàng của bạn đang trống, không thể tạo đơn' });
    }

    const orderCode = `FG-${Math.floor(100000 + Math.random() * 900000)}`;

    const subTotal = Number(body.subTotal || body.totalAmount || 0);
    const shippingFee = Number(body.shippingFee || 0);
    const discountAmount = Number(body.discountAmount || 0);
    const totalAmount = Number(body.totalAmount || subTotal + shippingFee - discountAmount || 0);

    // 3. Chuẩn hóa danh sách items theo schema OrderItem
    // Trong hàm createOrder:
    const formattedItems = await Promise.all(
      rawItems.map(async (item: any) => {
        const rawVariantId = String(item.variantId || item.id || '');
        
        // Kiểm tra xem variantId có tồn tại trong database không
        let validVariantId: string | null = null;
        if (rawVariantId && !rawVariantId.startsWith('mock-') && !rawVariantId.startsWith('fallback-')) {
          const exists = await prisma.productVariant.findUnique({
            where: { id: rawVariantId },
            select: { id: true },
          });
          if (exists) validVariantId = exists.id;
        }

        return {
          variantId: validVariantId, // Nếu không tìm thấy thì để null, không gây lỗi Foreign Key
          productName: String(item.name || item.productName || item.title || 'Sản phẩm Apple'),
          storage: String(item.storage || item.version || 'Tiêu chuẩn'),
          color: String(item.color || 'Mặc định'),
          price: Number(item.price || 0),
          quantity: Number(item.quantity || 1),
          imageUrl: String(item.imageUrl || item.image || item.thumbnail || ''),
        };
      })
    );

    // 4. Lưu đơn hàng vào Database
    const newOrder = await prisma.order.create({
      data: {
        orderCode,
        customerName,
        customerPhone,
        customerEmail,
        gender: body.gender || 'anh',
        deliveryMethod: body.deliveryMethod || (body.address ? 'Giao hàng tận nơi' : 'Nhận tại cửa hàng'),
        province: body.province || body.city || '',
        district: body.district || '',
        address: body.address || body.specificAddress || '',
        storeAddress: body.storeAddress || '',
        note: body.note || '',
        paymentMethod: body.paymentMethod || 'COD',
        paymentStatus: 'PENDING',
        orderStatus: 'CONFIRMED',
        subTotal,
        discountAmount,
        shippingFee,
        totalAmount,
        needVat: Boolean(body.needVat),
        vatInfo: body.vatInfo || undefined,
        items: {
          create: formattedItems,
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
    console.error('Lỗi khi tạo đơn hàng:', error);
    return res.status(500).json({ success: false, error: error.message || 'Lỗi lưu đơn hàng' });
  }
};