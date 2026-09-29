ALTER TABLE "Order"
ADD COLUMN "stockReservationStatus" TEXT NOT NULL DEFAULT 'COMMITTED',
ADD COLUMN "stockReservedUntil" TIMESTAMP(3),
ADD COLUMN "stockReleasedAt" TIMESTAMP(3);

-- Những đơn đã hủy trước migration được xem là đã hoàn kho.
UPDATE "Order"
SET "stockReservationStatus" = 'RELEASED',
    "stockReleasedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP)
WHERE UPPER("orderStatus") = 'CANCELLED';

CREATE INDEX "Order_stockReservationStatus_stockReservedUntil_idx"
ON "Order"("stockReservationStatus", "stockReservedUntil");

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "actorEmail" TEXT,
  "actorRole" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
