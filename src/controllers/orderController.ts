import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// ==========================================
// 1. TẠO ĐƠN HÀNG (Hỗ trợ Guest & Tài khoản)
// ==========================================
export const createOrder = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};

    const userId = body.userId || (req as any).user?.id || null;

    const customerName = (body.customerName || body.fullName || body.name || body.buyerName || '').toString().trim();
    const customerPhone = (body.customerPhone || body.phone || body.phoneNumber || body.tel || '').toString().trim();
    const customerEmail = (body.customerEmail || body.email || '').toString().trim() || null;

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

    const newOrder = await prisma.order.create({
      data: {
        orderCode,
        userId: userId || undefined,
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

// ==========================================
// 2. LẤY CHI TIẾT ĐƠN HÀNG THEO MÃ (Đã ép kiểu string an toàn)
// ==========================================
export const getOrderByCode = async (req: Request, res: Response) => {
  try {
    const rawCode = req.params.orderCode;
    const orderCode = Array.isArray(rawCode) ? rawCode[0] : rawCode;

    if (!orderCode) {
      return res.status(400).json({ success: false, error: 'Thiếu mã đơn hàng' });
    }

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

// ==========================================
// 3. KHÁCH HÀNG HỦY ĐƠN HÀNG (Đã ép kiểu string an toàn)
// ==========================================
export const cancelOrderCustomer = async (req: Request, res: Response) => {
  try {
    const rawCode = req.params.orderCode;
    const orderCode = Array.isArray(rawCode) ? rawCode[0] : rawCode;

    if (!orderCode) {
      return res.status(400).json({ success: false, error: 'Thiếu mã đơn hàng' });
    }

    const order = await prisma.order.findFirst({
      where: {
        OR: [{ orderCode: String(orderCode) }, { id: String(orderCode) }],
      },
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn hàng để hủy' });
    }

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

// ==========================================
// 4. LẤY TẤT CẢ ĐƠN HÀNG (Dành cho trang Admin)
// ==========================================
export const getAllOrdersAdmin = async (req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: orders });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 5. CẬP NHẬT TRẠNG THÁI ĐƠN (Admin)
// ==========================================
export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { orderStatus, paymentStatus } = req.body;

    const dataToUpdate: any = {};
    if (orderStatus) dataToUpdate.orderStatus = orderStatus;
    if (paymentStatus) dataToUpdate.paymentStatus = paymentStatus;

    if (orderStatus === 'COMPLETED' && !paymentStatus) {
      dataToUpdate.paymentStatus = 'PAID';
    }

    const updated = await prisma.order.update({
      where: { id: String(id) },
      data: dataToUpdate,
      include: { items: true },
    });

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 6. XÓA ĐƠN HÀNG ĐƠN LẺ (Admin)
// ==========================================
export const deleteOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.orderItem.deleteMany({
      where: { orderId: String(id) },
    });

    await prisma.order.delete({
      where: { id: String(id) },
    });

    return res.json({ success: true, message: 'Đã xóa đơn hàng thành công' });
  } catch (error: any) {
    console.error('Lỗi khi xóa đơn hàng:', error);
    return res.status(500).json({ success: false, error: error.message || 'Không thể xóa đơn hàng' });
  }
};

// ==========================================
// 7. XÓA HÀNG LOẠT NHIỀU ĐƠN HÀNG (Admin)
// ==========================================
export const deleteBulkOrders = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Danh sách ID đơn hàng không hợp lệ' });
    }

    await prisma.orderItem.deleteMany({
      where: { orderId: { in: ids } },
    });

    await prisma.order.deleteMany({
      where: { id: { in: ids } },
    });

    return res.json({ success: true, message: `Đã xóa thành công ${ids.length} đơn hàng` });
  } catch (error: any) {
    console.error('Lỗi khi xóa hàng loạt đơn hàng:', error);
    return res.status(500).json({ success: false, error: error.message || 'Không thể xóa hàng loạt đơn hàng' });
  }
};

// ==========================================
// 8. LẤY DANH SÁCH ĐƠN HÀNG CỦA TÀI KHOẢN CÁ NHÂN
// ==========================================
export const getMyOrders = async (req: Request, res: Response) => {
  try {
    const rawUserId = req.query.userId || (req as any).user?.id;
    const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'Thiếu ID người dùng' });
    }

    const orders = await prisma.order.findMany({
      where: { userId: String(userId) },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: orders });
  } catch (error: any) {
    console.error('Lỗi lấy danh sách đơn của tài khoản:', error);
    return res.status(500).json({ success: false, error: error.message || 'Lỗi lấy lịch sử đơn hàng' });
  }
};