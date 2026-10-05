import { Request } from 'express';
import { prisma } from '../lib/prisma';
import { writeAuditLog } from './auditLogService';
import { clearCachePattern } from '../middlewares/cacheMiddleware';

export const STOCK_RESERVATION_MINUTES = Math.max(5, Number(process.env.STOCK_RESERVATION_MINUTES || 15));

export const isOnlinePaymentMethod = (paymentMethod?: string | null) => {
  const method = String(paymentMethod || '').toLowerCase();
  return ['vnpay-qr', 'momo', 'card', 'qr', 'bank', 'chuyenkhoan', 'chuyển khoản'].some((item) => method.includes(item));
};

export const getReservationExpiry = () => new Date(Date.now() + STOCK_RESERVATION_MINUTES * 60_000);

type ReleaseOptions = {
  reason: 'CUSTOMER_CANCELLED' | 'ADMIN_CANCELLED' | 'PAYMENT_EXPIRED';
  req?: Request;
};

export const releaseOrderStock = async (orderId: string, options: ReleaseOptions) => {
  const orderDelegate = (prisma as any).order;
  const current = await orderDelegate.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!current) return null;
  if (current.stockReservationStatus === 'RELEASED') return current;

  await prisma.$transaction(async (tx) => {
    const claimed = await (tx as any).order.updateMany({
      where: {
        id: orderId,
        stockReservationStatus: { in: ['HELD', 'COMMITTED'] },
      },
      data: {
        stockReservationStatus: 'RELEASED',
        stockReleasedAt: new Date(),
        stockReservedUntil: null,
        orderStatus: 'CANCELLED',
        ...(options.reason === 'PAYMENT_EXPIRED' && { paymentStatus: 'EXPIRED' }),
      },
    });

    if (claimed.count !== 1) return;
    for (const item of current.items) {
      if (!item.variantId) continue;
      await tx.productVariant.updateMany({
        where: { id: item.variantId },
        data: { stock: { increment: item.quantity } },
      });
    }

    await writeAuditLog(tx, options.req, {
      action: options.reason,
      entityType: 'ORDER',
      entityId: orderId,
      before: {
        orderStatus: current.orderStatus,
        paymentStatus: current.paymentStatus,
        stockReservationStatus: current.stockReservationStatus,
      },
      after: {
        orderStatus: 'CANCELLED',
        paymentStatus: options.reason === 'PAYMENT_EXPIRED' ? 'EXPIRED' : current.paymentStatus,
        stockReservationStatus: 'RELEASED',
      },
      metadata: { orderCode: current.orderCode, restoredItems: current.items.length },
    });
  });

  clearCachePattern('fogo_cache:*').catch(() => {});

  return orderDelegate.findUnique({ where: { id: orderId }, include: { items: true } });
};

export const releaseExpiredStockReservations = async () => {
  const expired = await (prisma as any).order.findMany({
    where: {
      stockReservationStatus: 'HELD',
      stockReservedUntil: { lte: new Date() },
      paymentStatus: { not: 'PAID' },
    },
    select: { id: true },
    take: 100,
  });

  for (const order of expired) {
    await releaseOrderStock(order.id, { reason: 'PAYMENT_EXPIRED' }).catch((error) => {
      console.error(`Không thể hoàn kho đơn hết hạn ${order.id}:`, error);
    });
  }
  return expired.length;
};
