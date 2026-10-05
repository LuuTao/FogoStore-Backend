import { prisma } from '../lib/prisma';

export const getMembershipStats = async (userId: string) => {
  const completedOrders = await prisma.order.findMany({
    where: {
      userId,
      orderStatus: { not: 'CANCELLED' },
      OR: [
        { orderStatus: { in: ['DELIVERED', 'COMPLETED'] } },
        { paymentStatus: 'PAID' },
      ],
    },
    include: { items: true },
  });

  const totalItemsPurchased = completedOrders.reduce(
    (total, order) => total + order.items.reduce((sum, item) => sum + Math.max(0, item.quantity || 0), 0),
    0
  );
  const rank: 'VIP' | 'LOYAL' | 'MEMBER' =
    totalItemsPurchased >= 4 ? 'VIP' : totalItemsPurchased >= 1 ? 'LOYAL' : 'MEMBER';

  return { totalItemsPurchased, rank };
};
