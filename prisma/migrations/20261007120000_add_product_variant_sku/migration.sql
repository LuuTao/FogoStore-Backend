-- Mã biến thể từ file nhập (Haravan/SKU nội bộ) là khóa ổn định để
-- nhập lại Excel có thể cập nhật đúng cấu hình thay vì tạo bản sao.
ALTER TABLE "ProductVariant" ADD COLUMN "sku" TEXT;

CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");
