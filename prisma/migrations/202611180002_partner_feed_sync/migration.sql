CREATE TABLE "inventory_feed_sync" (
    "id" TEXT PRIMARY KEY,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "revision" TEXT,
    "message" TEXT
);
