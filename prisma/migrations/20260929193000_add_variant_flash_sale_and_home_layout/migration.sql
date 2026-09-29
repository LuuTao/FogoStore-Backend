-- Chọn Flash Sale ở cấp từng biến thể/cấu hình.
ALTER TABLE "ProductVariant"
ADD COLUMN "isFlashSale" BOOLEAN NOT NULL DEFAULT false;

-- Giữ lại lựa chọn cũ: model từng được chọn sẽ áp dụng cho các biến thể hiện có.
UPDATE "ProductVariant" AS variant
SET "isFlashSale" = true
FROM "Product" AS product
WHERE variant."productId" = product."id"
  AND product."isFlashSale" = true;

-- Thứ tự và trạng thái hiển thị các khối nội dung trên trang chủ.
CREATE TABLE "HomeLayout" (
  "id" TEXT NOT NULL DEFAULT 'HOME',
  "sections" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HomeLayout_pkey" PRIMARY KEY ("id")
);
