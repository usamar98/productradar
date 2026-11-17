import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalDb.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "postgresql://gpu:gpu@localhost:5432/gpu_stock_watch", connectionTimeoutMillis: 3000, max: 10 }) });
if (process.env.NODE_ENV !== "production") globalDb.prisma = prisma;
