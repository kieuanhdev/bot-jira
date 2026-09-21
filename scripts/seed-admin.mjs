// Seed the bootstrap admin user at container start (idempotent).
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const email = process.env.ADMIN_EMAIL ?? "admin@team.local";
const password = process.env.ADMIN_PASSWORD ?? "admin123";
const name = process.env.ADMIN_NAME ?? "Admin";
const jiraUsername = process.env.ADMIN_JIRA_USERNAME ?? null;

try {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, displayName: name, role: "admin", jiraUsername },
  });
  console.log(`[seed] admin ready: ${user.email}`);
} catch (e) {
  console.error("[seed] failed:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
