ALTER TABLE "sources" ADD COLUMN "locationId" TEXT;
ALTER TABLE "sources" ADD COLUMN "fulfillment" TEXT NOT NULL DEFAULT 'online';
CREATE INDEX "sources_locationId_variantId_idx" ON "sources"("locationId", "variantId");
