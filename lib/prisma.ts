import "server-only";
import { PrismaClient } from "@/generated/prisma/client";

type GlobalForPrisma = {
  prisma: PrismaClient | undefined;
};

const globalForPrisma = globalThis as unknown as GlobalForPrisma;

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
