import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  var prisma: PrismaClient | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Please add it to your environment (e.g. in a .env file). ");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma = globalThis.prisma ??
  new PrismaClient({ adapter, log: ["error"] });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}
