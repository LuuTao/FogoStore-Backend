import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { clearCachePattern } from '../middlewares/cacheMiddleware';

// ==========================================
// 1. TẠO ĐƠN HÀNG (Trừ kho tự động & Xác nhận QR)
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

    // Nhận diện phương thức thanh toán
    const rawMethod = (body.paymentMethod || 'COD').toString().toLowerCase();
    const isQrPayment = ['vnpay-qr', 'momo', 'qr', 'bank', 'chuyenkhoan'].some((m) => rawMethod.includes(m));
    const initialPaymentStatus = isQrPayment ? 'PAID' : (body.paymentStatus || 'PENDING');

    // Chạy trong Transaction: Vừa kiểm tra trừ tồn kho, vừa tạo đơn
    const newOrder = await prisma.$transaction(async (tx) => {
      const formattedItems = [];

      for (const item of rawItems) {
        const rawVariantId = String(item.variantId || item.id || '');
        let validVariantId: string | null = null;

        if (rawVariantId && !rawVariantId.startsWith('mock-') && !rawVariantId.startsWith('fallback-')) {
          const variant = await tx.productVariant.findUnique({
            where: { id: rawVariantId },
          });

          if (variant) {
            const requestedQty = Number(item.quantity || 1);
            if (variant.stock < requestedQty) {
              throw new Error(`Sản phẩm "${item.name || variant.slug}" chỉ còn ${variant.stock} chiếc, không đủ số lượng bạn yêu cầu!`);
            }

            // Trừ số lượng tồn kho
            await tx.productVariant.update({
              where: { id: variant.id },
              data: {
                stock: { decrement: requestedQty },
              },
            });

            validVariantId = variant.id;
          }
        }

        formattedItems.push({
          variantId: validVariantId,
          productName: String(item.name || item.productName || item.title || 'Sản phẩm Apple'),
          storage: String(item.storage || item.version || 'Tiêu chuẩn'),
          color: String(item.color || 'Mặc định'),
          price: Number(item.price || 0),
          quantity: Number(item.quantity || 1),
          imageUrl: String(item.imageUrl || item.image || item.thumbnail || ''),
        });
      }

      // Tạo đơn hàng chính thức
      return await tx.order.create({
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
          paymentStatus: initialPaymentStatus,
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
    });

    // Làm mới cache sản phẩm ngoài trang chủ để người xem thấy ngay tồn kho mới
    clearCachePattern('fogo_cache:*').catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'Đặt hàng thành công!',
      data: newOrder,
    });
  } catch (error: any) {
    console.error('Lỗi khi tạo đơn hàng:', error);
    return res.status(400).json({ success: false, error: error.message || 'Lỗi lưu đơn hàng' });
  }
};

// ==========================================
// 2. LẤY CHI TIẾT ĐƠN HÀNG THEO MÃ
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
// 3. KHÁCH HÀNG HỦY ĐƠN (Hoàn tồn kho tự động)
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
      include: { items: true },
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn hàng để hủy' });
    }

    if (['SHIPPING', 'COMPLETED', 'DELIVERED', 'CANCELLED'].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Đơn hàng đang giao, đã hoàn tất hoặc đã hủy trước đó, không thể hủy tiếp!',
      });
    }

    // Hoàn lại số lượng tồn kho cho các biến thể trong đơn
    const updated = await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: {
              stock: { increment: item.quantity },
            },
          }).catch(() => {});
        }
      }

      return await tx.order.update({
        where: { id: order.id },
        data: { orderStatus: 'CANCELLED' },
        include: { items: true },
      });
    });

    clearCachePattern('fogo_cache:*').catch(() => {});

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
// 4. LẤY TẤT CẢ ĐƠN HÀNG (Admin)
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
    await prisma.orderItem.deleteMany({ where: { orderId: String(id) } });
    await prisma.order.delete({ where: { id: String(id) } });
    return res.json({ success: true, message: 'Đã xóa đơn hàng' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
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
    return res.status(500).json({ success: false, error: error.message || 'Không thể xóa hàng loạt đơn hàng' });
  }
};

// ==========================================
// 8. LẤY DANH SÁCH ĐƠN HÀNG THEO TÀI KHOẢN
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
    return res.status(500).json({ success: false, error: error.message || 'Lỗi lấy lịch sử đơn hàng' });
  }
};

// ==========================================
// 9. KHÁCH HÀNG CẬP NHẬT THÔNG TIN ĐƠN
// ==========================================
export const updateOrderCustomer = async (req: Request, res: Response) => {
  try {
    const rawCode = req.params.orderCode;
    const orderCode = Array.isArray(rawCode) ? rawCode[0] : rawCode;
    const { customerName, customerPhone, address, note, paymentMethod, paymentStatus } = req.body;

    if (!orderCode) {
      return res.status(400).json({ success: false, error: 'Thiếu mã đơn hàng' });
    }

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
      message: 'Cập nhật thông tin đơn hàng thành công!',
      data: updated,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};