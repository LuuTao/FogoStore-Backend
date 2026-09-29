CREATE TABLE "FlashSaleConfig" (
    "id" TEXT NOT NULL DEFAULT 'HOME',
    "title" TEXT NOT NULL DEFAULT 'FLASH SALE GIÁ SỐC',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlashSaleConfig_pkey" PRIMARY KEY ("id")
);
