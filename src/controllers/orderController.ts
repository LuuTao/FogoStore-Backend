import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { clearCachePattern } from '../middlewares/cacheMiddleware';
import {
  getReservationExpiry,
  isOnlinePaymentMethod,
  releaseOrderStock,
} from '../services/stockReservationService';
import { writeAuditLog } from '../services/auditLogService';
import type { AuthenticatedRequest } from '../lib/authMiddleware';
import {
  canAccessOrder,
  createOrderAccessToken,
  hashOrderAccessToken,
  rejectOrderAccess,
  setOrderAccessCookie,
} from '../lib/orderAccess';
import crypto from 'crypto';
import { getMembershipStats } from '../services/membershipService';

const hideOrderAccessHash = (order: any) => {
  if (!order) return order;
  const { accessTokenHash: _hiddenAccessTokenHash, ...safeOrder } = order;
  return safeOrder;
};

// ==========================================
// 1. TẠO ĐƠN HÀNG (Trừ kho tự động & Xác nhận QR)
// ==========================================
export const createOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body || {};

    const userId = req.user?.id || null;
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
    const couponCode = String(body.couponCode || '').trim().toUpperCase();
    const allowedCouponCodes = new Set(['', 'FOGO100', 'VIPAPPLE']);
    if (!allowedCouponCodes.has(couponCode)) {
      return res.status(400).json({ success: false, error: 'Mã giảm giá không hợp lệ hoặc đã hết hiệu lực' });
    }
    if (couponCode === 'VIPAPPLE') {
      if (!userId) {
        return res.status(403).json({ success: false, error: 'Mã VIPAPPLE chỉ dành cho thành viên VIP đã đăng nhập' });
      }
      const membership = await getMembershipStats(userId);
      if (membership.rank !== 'VIP') {
        return res.status(403).json({ success: false, error: 'Tài khoản chưa đủ điều kiện thành viên VIP' });
      }
    }

    if (!customerName || customerName.length > 120) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập họ và tên người nhận' });
    }

    if (!/^(?:\+84|0)\d{9,10}$/.test(customerPhone.replace(/[\s.-]/g, ''))) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập số điện thoại người nhận' });
    }

    if (rawItems.length === 0 || rawItems.length > 20) {
      return res.status(400).json({ success: false, error: 'Giỏ hàng của bạn đang trống, không thể tạo đơn' });
    }

    let orderCode = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `FG-${crypto.randomInt(10_000_000, 100_000_000)}`;
      const exists = await prisma.order.findUnique({ where: { orderCode: candidate }, select: { id: true } });
      if (!exists) {
        orderCode = candidate;
        break;
      }
    }
    if (!orderCode) throw new Error('Không thể tạo mã đơn duy nhất. Vui lòng thử lại.');
    const requestedPaymentMethod = String(body.paymentMethod || 'cod').toLowerCase();
    const allowedPaymentMethods = new Set(['cod', 'vnpay-qr', 'momo', 'card']);
    if (!allowedPaymentMethods.has(requestedPaymentMethod)) {
      return res.status(400).json({ success: false, error: 'Phương thức thanh toán không hợp lệ' });
    }
    const paymentMethod = requestedPaymentMethod;
    const holdsStockTemporarily = isOnlinePaymentMethod(paymentMethod);
    const orderAccessToken = createOrderAccessToken();
    const accessTokenHash = hashOrderAccessToken(orderAccessToken);

    // Nhận diện phương thức thanh toán
    // Tạo đơn online chỉ mới ghi nhận yêu cầu thanh toán. Không được đánh dấu
    // PAID từ dữ liệu phía trình duyệt; trạng thái này chỉ được cập nhật sau
    // khi webhook/cổng thanh toán hoặc nhân viên xác nhận tiền đã vào tài khoản.
    const initialPaymentStatus = 'PENDING';

    // Chạy trong Transaction: Vừa kiểm tra trừ tồn kho, vừa tạo đơn
    const newOrder = await prisma.$transaction(async (tx) => {
      const formattedItems = [];
      let calculatedSubTotal = 0;

      for (const item of rawItems) {
        const rawVariantId = String(item.variantId || item.id || '');
        if (!rawVariantId || rawVariantId.startsWith('mock-') || rawVariantId.startsWith('fallback-')) {
          throw new Error('Sản phẩm trong giỏ không còn hợp lệ. Vui lòng tải lại trang và chọn lại cấu hình sản phẩm.');
        }

        const variant = await tx.productVariant.findUnique({
          where: { id: rawVariantId },
          include: { product: true },
        });
        if (!variant) {
          throw new Error('Sản phẩm trong giỏ đã thay đổi hoặc không còn tồn tại. Vui lòng tải lại trang.');
        }

        const requestedQty = Number(item.quantity || 1);
        if (!Number.isInteger(requestedQty) || requestedQty < 1 || requestedQty > 10) {
          throw new Error('Số lượng sản phẩm không hợp lệ.');
        }
        if (variant.stock < requestedQty) {
          throw new Error(`Sản phẩm "${item.name || variant.slug}" chỉ còn ${variant.stock} chiếc, không đủ số lượng bạn yêu cầu!`);
        }

        // Trừ tồn kho có điều kiện trong một câu lệnh nguyên tử. Nếu hai khách
        // mua đồng thời, chỉ giao dịch đầu tiên còn đủ tồn mới thành công.
        const stockUpdate = await tx.productVariant.updateMany({
          where: { id: variant.id, stock: { gte: requestedQty } },
          data: { stock: { decrement: requestedQty } },
        });
        if (stockUpdate.count !== 1) {
          throw new Error(`Sản phẩm "${item.name || variant.slug}" vừa hết hoặc không còn đủ số lượng. Vui lòng chọn lại!`);
        }

        const unitPrice = Number(variant.price);
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          throw new Error('Giá sản phẩm trong hệ thống không hợp lệ. Vui lòng liên hệ cửa hàng.');
        }
        calculatedSubTotal += unitPrice * requestedQty;
        formattedItems.push({
          variantId: variant.id,
          productName: variant.product.name,
          storage: variant.storage || 'Tiêu chuẩn',
          color: variant.color || 'Mặc định',
          price: unitPrice,
          quantity: requestedQty,
          imageUrl: variant.images?.[0] || '',
        });
      }

      const validDiscounts: Record<string, number> = { FOGO100: 100_000, VIPAPPLE: 500_000 };
      const discountAmount = Math.min(validDiscounts[couponCode] || 0, calculatedSubTotal);
      const shippingFee = 0;
      const totalAmount = Math.max(0, calculatedSubTotal + shippingFee - discountAmount);

      // Tạo đơn hàng chính thức
      const created = await (tx as any).order.create({
        data: {
          orderCode,
          accessTokenHash,
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
          paymentMethod,
          paymentStatus: initialPaymentStatus,
          orderStatus: holdsStockTemporarily ? 'PENDING_PAYMENT' : 'CONFIRMED',
          stockReservationStatus: holdsStockTemporarily ? 'HELD' : 'COMMITTED',
          stockReservedUntil: holdsStockTemporarily ? getReservationExpiry() : null,
          subTotal: calculatedSubTotal,
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
      await writeAuditLog(tx, req, {
        action: holdsStockTemporarily ? 'ORDER_CREATED_STOCK_HELD' : 'ORDER_CREATED_STOCK_COMMITTED',
        entityType: 'ORDER',
        entityId: created.id,
        after: {
          orderCode: created.orderCode,
          orderStatus: created.orderStatus,
          paymentStatus: created.paymentStatus,
          stockReservationStatus: created.stockReservationStatus,
          stockReservedUntil: created.stockReservedUntil,
        },
        metadata: { itemCount: formattedItems.length, totalAmount },
      });
      return created;
    });

    // Làm mới cache sản phẩm ngoài trang chủ để người xem thấy ngay tồn kho mới
    clearCachePattern('fogo_cache:*').catch(() => {});
    if (!userId) setOrderAccessCookie(res, newOrder.orderCode, orderAccessToken);

    return res.status(201).json({
      success: true,
      message: 'Đặt hàng thành công!',
      data: hideOrderAccessHash(newOrder),
    });
  } catch (error: any) {
    console.error('Lỗi khi tạo đơn hàng:', error);
    return res.status(400).json({ success: false, error: error.message || 'Lỗi lưu đơn hàng' });
  }
};

// ==========================================
// 2. LẤY CHI TIẾT ĐƠN HÀNG THEO MÃ
// ==========================================
export const getOrderByCode = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawCode = req.params.orderCode;
    const orderCode = Array.isArray(rawCode) ? rawCode[0] : rawCode;

    if (!orderCode) {
      return res.status(400).json({ success: false, error: 'Thiếu mã đơn hàng' });
    }

    let order: any = await (prisma as any).order.findFirst({
      where: {
        OR: [
          { orderCode: String(orderCode) },
          { id: String(orderCode) },
        ],
      },
      include: { items: true },
    });

    if (!order) {
      return rejectOrderAccess(res);
    }

    if (!canAccessOrder(req, order)) return rejectOrderAccess(res);

    const suppliedHeaderToken = String(req.headers['x-order-token'] || '').trim();
    if (suppliedHeaderToken && order.accessTokenHash) {
      setOrderAccessCookie(res, order.orderCode, suppliedHeaderToken);
    }

    if (
      order.stockReservationStatus === 'HELD' &&
      order.paymentStatus !== 'PAID' &&
      order.stockReservedUntil &&
      new Date(order.stockReservedUntil).getTime() <= Date.now()
    ) {
      order = await releaseOrderStock(order.id, { reason: 'PAYMENT_EXPIRED' });
    }

    return res.json({
      success: true,
      data: {
        ...hideOrderAccessHash(order),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 3. KHÁCH HÀNG HỦY ĐƠN (Hoàn tồn kho tự động)
// ==========================================
export const cancelOrderCustomer = async (req: AuthenticatedRequest, res: Response) => {
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
      return rejectOrderAccess(res);
    }

    if (!canAccessOrder(req, order)) return rejectOrderAccess(res);

    if (['SHIPPING', 'COMPLETED', 'DELIVERED', 'CANCELLED'].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Đơn hàng đang giao, đã hoàn tất hoặc đã hủy trước đó, không thể hủy tiếp!',
      });
    }

    const updated = await releaseOrderStock(order.id, { reason: 'CUSTOMER_CANCELLED', req });

    clearCachePattern('fogo_cache:*').catch(() => {});

    return res.json({
      success: true,
      message: 'Hủy đơn hàng thành công!',
      data: hideOrderAccessHash(updated),
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
    return res.json({ success: true, data: orders.map(hideOrderAccessHash) });
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

    const allowedOrderStatuses = new Set(['PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING', 'SHIPPING', 'COMPLETED', 'DELIVERED', 'CANCELLED']);
    const allowedPaymentStatuses = new Set(['PENDING', 'UNPAID', 'PAID', 'EXPIRED', 'FAILED']);
    if (orderStatus && !allowedOrderStatuses.has(String(orderStatus))) {
      return res.status(400).json({ success: false, error: 'Trạng thái đơn hàng không hợp lệ' });
    }
    if (paymentStatus && !allowedPaymentStatuses.has(String(paymentStatus))) {
      return res.status(400).json({ success: false, error: 'Trạng thái thanh toán không hợp lệ' });
    }

    const dataToUpdate: any = {};
    if (orderStatus) dataToUpdate.orderStatus = orderStatus;
    if (paymentStatus) dataToUpdate.paymentStatus = paymentStatus;

    const existingOrder = await prisma.order.findUnique({
      where: { id: String(id) },
      include: { items: true },
    });
    if (!existingOrder) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn hàng' });
    }
    const isOnlinePayment = isOnlinePaymentMethod(existingOrder.paymentMethod);

    if (orderStatus === 'COMPLETED' && !paymentStatus && !isOnlinePayment) {
      dataToUpdate.paymentStatus = 'PAID';
    }

    const isCancelling = String(orderStatus || '').toUpperCase() === 'CANCELLED';
    if (isCancelling) {
      const cancelled = await releaseOrderStock(existingOrder.id, { reason: 'ADMIN_CANCELLED', req });
      clearCachePattern('fogo_cache:*').catch(() => {});
      return res.json({ success: true, data: hideOrderAccessHash(cancelled) });
    }

    const updated = await prisma.$transaction(async (tx) => {
      let updatedOrder;
      if (paymentStatus === 'PAID') {
        const captured = await (tx as any).order.updateMany({
          where: {
            id: String(id),
            stockReservationStatus: { not: 'RELEASED' },
            OR: [{ stockReservedUntil: null }, { stockReservedUntil: { gt: new Date() } }],
          },
          data: {
            ...dataToUpdate,
            orderStatus: orderStatus || (existingOrder.orderStatus === 'PENDING_PAYMENT' ? 'CONFIRMED' : existingOrder.orderStatus),
            stockReservationStatus: 'COMMITTED',
            stockReservedUntil: null,
          },
        });
        if (captured.count !== 1) throw new Error('Phiên giữ hàng đã hết hạn hoặc tồn kho đã được hoàn; không thể xác nhận thanh toán.');
        updatedOrder = await (tx as any).order.findUnique({ where: { id: String(id) }, include: { items: true } });
      } else {
        updatedOrder = await (tx as any).order.update({
          where: { id: String(id) },
          data: dataToUpdate,
          include: { items: true },
        });
      }
      await writeAuditLog(tx, req, {
        action: 'ORDER_STATUS_UPDATED',
        entityType: 'ORDER',
        entityId: existingOrder.id,
        before: { orderStatus: existingOrder.orderStatus, paymentStatus: existingOrder.paymentStatus },
        after: { orderStatus: updatedOrder.orderStatus, paymentStatus: updatedOrder.paymentStatus },
        metadata: { orderCode: existingOrder.orderCode },
      });
      return updatedOrder;
    });

    return res.json({ success: true, data: hideOrderAccessHash(updated) });
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
    const existing = await (prisma as any).order.findUnique({ where: { id: String(id) }, include: { items: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'Không tìm thấy đơn hàng' });
    if (existing.stockReservationStatus !== 'RELEASED') {
      await releaseOrderStock(existing.id, { reason: 'ADMIN_CANCELLED', req });
    }
    await prisma.$transaction(async (tx) => {
      await writeAuditLog(tx, req, {
        action: 'ORDER_DELETED',
        entityType: 'ORDER',
        entityId: existing.id,
        before: { orderCode: existing.orderCode, orderStatus: existing.orderStatus, paymentStatus: existing.paymentStatus },
      });
      await tx.orderItem.deleteMany({ where: { orderId: String(id) } });
      await tx.order.delete({ where: { id: String(id) } });
    });
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

    const orders = await (prisma as any).order.findMany({ where: { id: { in: ids } }, include: { items: true } });
    for (const order of orders) {
      if (order.stockReservationStatus !== 'RELEASED') {
        await releaseOrderStock(order.id, { reason: 'ADMIN_CANCELLED', req });
      }
    }
    await prisma.$transaction(async (tx) => {
      for (const order of orders) {
        await writeAuditLog(tx, req, {
          action: 'ORDER_DELETED',
          entityType: 'ORDER',
          entityId: order.id,
          before: { orderCode: order.orderCode, orderStatus: order.orderStatus, paymentStatus: order.paymentStatus },
        });
      }
      await tx.orderItem.deleteMany({ where: { orderId: { in: ids } } });
      await tx.order.deleteMany({ where: { id: { in: ids } } });
    });

    return res.json({ success: true, message: `Đã xóa thành công ${ids.length} đơn hàng` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Không thể xóa hàng loạt đơn hàng' });
  }
};

// ==========================================
// 8. LẤY DANH SÁCH ĐƠN HÀNG THEO TÀI KHOẢN
// ==========================================
export const getMyOrders = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'Thiếu ID người dùng' });
    }

    const orders = await prisma.order.findMany({
      where: { userId: String(userId) },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: orders.map(hideOrderAccessHash) });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Lỗi lấy lịch sử đơn hàng' });
  }
};

// ==========================================
// 9. KHÁCH HÀNG CẬP NHẬT THÔNG TIN ĐƠN
// ==========================================
export const updateOrderCustomer = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawCode = req.params.orderCode;
    const orderCode = Array.isArray(rawCode) ? rawCode[0] : rawCode;
    const { customerName, customerPhone, address, note, paymentMethod } = req.body;

    if (!orderCode) {
      return res.status(400).json({ success: false, error: 'Thiếu mã đơn hàng' });
    }

    const order = await prisma.order.findFirst({
      where: {
        OR: [{ orderCode: String(orderCode) }, { id: String(orderCode) }],
      },
    });

    if (!order) {
      return rejectOrderAccess(res);
    }

    if (!canAccessOrder(req, order)) return rejectOrderAccess(res);

    if (order.orderStatus === 'CANCELLED') {
      return res.status(400).json({ success: false, error: 'Đơn hàng này đã bị hủy, không thể thay đổi!' });
    }

    const normalizedPaymentMethod = paymentMethod ? String(paymentMethod).toLowerCase() : undefined;
    if (normalizedPaymentMethod && !['cod', 'vnpay-qr', 'momo', 'card'].includes(normalizedPaymentMethod)) {
      return res.status(400).json({ success: false, error: 'Phương thức thanh toán không hợp lệ' });
    }

    if (customerName !== undefined && (!String(customerName).trim() || String(customerName).trim().length > 120)) {
      return res.status(400).json({ success: false, error: 'Tên người nhận không hợp lệ' });
    }
    if (customerPhone !== undefined && !/^(?:\+84|0)\d{9,10}$/.test(String(customerPhone).replace(/[\s.-]/g, ''))) {
      return res.status(400).json({ success: false, error: 'Số điện thoại người nhận không hợp lệ' });
    }
    if (address !== undefined && String(address).length > 500) {
      return res.status(400).json({ success: false, error: 'Địa chỉ nhận hàng quá dài' });
    }
    if (note !== undefined && String(note).length > 1000) {
      return res.status(400).json({ success: false, error: 'Ghi chú đơn hàng quá dài' });
    }

    const paymentUpdate: Record<string, unknown> = {};
    if (normalizedPaymentMethod && normalizedPaymentMethod !== order.paymentMethod) {
      if (order.paymentStatus === 'PAID') {
        return res.status(400).json({ success: false, error: 'Đơn đã thanh toán nên không thể đổi phương thức thanh toán' });
      }
      if (order.stockReservationStatus === 'RELEASED') {
        return res.status(400).json({ success: false, error: 'Phiên giữ hàng đã hết hạn. Vui lòng tạo đơn hàng mới.' });
      }
      if (
        order.stockReservationStatus === 'HELD' &&
        order.stockReservedUntil &&
        order.stockReservedUntil.getTime() <= Date.now()
      ) {
        await releaseOrderStock(order.id, { reason: 'PAYMENT_EXPIRED', req });
        clearCachePattern('fogo_cache:*').catch(() => {});
        return res.status(400).json({ success: false, error: 'Phiên thanh toán đã hết hạn. Tồn kho đã được hoàn lại.' });
      }

      const wasOnline = isOnlinePaymentMethod(order.paymentMethod);
      const willBeOnline = isOnlinePaymentMethod(normalizedPaymentMethod);
      paymentUpdate.paymentMethod = normalizedPaymentMethod;
      if (!wasOnline && willBeOnline) {
        paymentUpdate.paymentStatus = 'PENDING';
        paymentUpdate.orderStatus = 'PENDING_PAYMENT';
        paymentUpdate.stockReservationStatus = 'HELD';
        paymentUpdate.stockReservedUntil = getReservationExpiry();
      } else if (wasOnline && !willBeOnline) {
        paymentUpdate.paymentStatus = 'PENDING';
        paymentUpdate.orderStatus = 'CONFIRMED';
        paymentUpdate.stockReservationStatus = 'COMMITTED';
        paymentUpdate.stockReservedUntil = null;
      }
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        ...(customerName && { customerName: customerName.trim() }),
        ...(customerPhone && { customerPhone: customerPhone.trim() }),
        ...(address !== undefined && { address: address.trim() }),
        ...(note !== undefined && { note: note.trim() }),
        ...paymentUpdate,
      },
      include: { items: true },
    });

    return res.json({
      success: true,
      message: 'Cập nhật thông tin đơn hàng thành công!',
      data: hideOrderAccessHash(updated),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
