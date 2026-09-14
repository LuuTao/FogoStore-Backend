import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// 1. TẠO ĐƠN HÀNG (Bắt buộc tài khoản & Gắn userId)
export const createOrder = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};

    // Bắt buộc phải có tài khoản đăng nhập (lấy từ body hoặc auth middleware)
    const userId = body.userId || (req as any).user?.id || null;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Vui lòng đăng nhập tài khoản để tiến hành đặt hàng!',
      });
    }

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

    // 3. Chuẩn hóa danh sách items theo schema OrderItem (Kiểm tra ID tránh Foreign Key error)
    const formattedItems = await Promise.all(
      rawItems.map(async (item: any) => {
        const rawVariantId = String(item.variantId || item.id || '');

        let validVariantId: string | null = null;
        if (rawVariantId && !rawVariantId.startsWith('mock-') && !rawVariantId.startsWith('fallback-')) {
          const exists = await prisma.productVariant.findUnique({
            where: { id: rawVariantId },
            select: { id: true },
          });
          if (exists) validVariantId = exists.id;
        }

        return {
          variantId: validVariantId,
          productName: String(item.name || item.productName || item.title || 'Sản phẩm Apple'),
          storage: String(item.storage || item.version || 'Tiêu chuẩn'),
          color: String(item.color || 'Mặc định'),
          price: Number(item.price || 0),
          quantity: Number(item.quantity || 1),
          imageUrl: String(item.imageUrl || item.image || item.thumbnail || ''),
        };
      })
    );

    // 4. Lưu đơn hàng vào Database cùng userId
    const newOrder = await prisma.order.create({
      data: {
        orderCode,
        userId, // Gắn đơn hàng vào tài khoản người dùng
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

// 1. LẤY CHI TIẾT ĐƠN HÀNG (Đảm bảo include items)
export const getOrderByCode = async (req: Request, res: Response) => {
  try {
    const { orderCode } = req.params;
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { orderCode: String(orderCode) },
          { id: String(orderCode) },
        ],
      },
      include: { items: true },
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn hàng' });
    }

    return res.json({ success: true, data: order });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 2. KHÁCH HÀNG HỦY ĐƠN HÀNG
export const cancelOrderCustomer = async (req: Request, res: Response) => {
  try {
    const { orderCode } = req.params;

    const order = await prisma.order.findFirst({
      where: {
        OR: [{ orderCode: String(orderCode) }, { id: String(orderCode) }],
      },
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn hàng để hủy' });
    }

    // Chỉ cho phép hủy khi đơn chưa giao
    if (order.orderStatus === 'SHIPPING' || order.orderStatus === 'COMPLETED' || order.orderStatus === 'DELIVERED') {
      return res.status(400).json({
        success: false,
        error: 'Đơn hàng đang giao hoặc đã hoàn tất, không thể hủy trực tuyến. Vui lòng gọi CSKH!',
      });
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { orderStatus: 'CANCELLED' },
      include: { items: true },
    });

    return res.json({
      success: true,
      message: 'Hủy đơn hàng thành công!',
      data: updated,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 3. KHÁCH HÀNG CHỈNH SỬA THÔNG TIN NHẬN HÀNG
export const updateOrderCustomer = async (req: Request, res: Response) => {
  try {
    const { orderCode } = req.params;
    const { customerName, customerPhone, address, note, paymentMethod, paymentStatus } = req.body;

    const order = await prisma.order.findFirst({
      where: {
        OR: [{ orderCode: String(orderCode) }, { id: String(orderCode) }],
      },
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn hàng' });
    }

    if (order.orderStatus === 'CANCELLED') {
      return res.status(400).json({ success: false, error: 'Đơn hàng này đã bị hủy, không thể thay đổi!' });
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        ...(customerName && { customerName: customerName.trim() }),
        ...(customerPhone && { customerPhone: customerPhone.trim() }),
        ...(address !== undefined && { address: address.trim() }),
        ...(note !== undefined && { note: note.trim() }),
        ...(paymentMethod && { paymentMethod }),
        ...(paymentStatus && { paymentStatus }),
      },
      include: { items: true },
    });

    return res.json({
      success: true,
      message: 'Cập nhật đơn hàng thành công!',
      data: updated,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 3. LẤY DANH SÁCH ĐƠN HÀNG CỦA MỖI TÀI KHOẢN (Dùng cho trang /tai-khoan/don-hang)
export const getMyOrders = async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || (req as any).user?.id;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'Thiếu ID người dùng' });
    }

    const orders = await prisma.order.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: orders });
  } catch (error: any) {
    console.error('Lỗi lấy danh sách đơn của tài khoản:', error);
    return res.status(500).json({ success: false, error: error.message || 'Lỗi lấy lịch sử đơn hàng' });
  }
};