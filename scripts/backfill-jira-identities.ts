/**
 * Script to safely backfill `jiraIdentityKey` for existing users with Jira tokens.
 * Run with: npx tsx --env-file-if-exists=.env scripts/backfill-jira-identities.ts [--dry-run]
 *
 * Rules:
 * - Never log or leak raw Jira tokens.
 * - Idempotent: skips users who already have jiraIdentityKey unless re-check requested.
 * - Resolves collisions cleanly without auto-merging.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { safeDecrypt } from "../src/lib/crypto";
import { verifyJiraCredential } from "../src/lib/jira/auth-service";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  console.log("=== BẮT ĐẦU KIỂM TRA & BACKFILL JIRA IDENTITY ===");
  if (isDryRun) {
    console.log("👉 ĐANG CHẠY Ở CHẾ ĐỘ DRY-RUN (Không thay đổi dữ liệu)");
  }

  // 1. Verify encryption key
  if (!process.env.CRED_ENCRYPTION_KEY) {
    console.error("❌ LỖI: Chưa cấu hình biến môi trường CRED_ENCRYPTION_KEY.");
    process.exit(1);
  }

  if (!process.env.JIRA_BASE_URL) {
    console.error("❌ LỖI: Chưa cấu hình biến môi trường JIRA_BASE_URL.");
    process.exit(1);
  }

  // 2. Baseline stats
  const allUsers = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      jiraUsername: true,
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
      jiraIdentityKey: true,
      jiraVerifiedAt: true,
    },
  });

  const totalUsers = allUsers.length;
  const usersWithToken = allUsers.filter((u) => Boolean(u.jiraTokenEnc));
  const usersWithIdentity = allUsers.filter((u) => Boolean(u.jiraIdentityKey));
  const adminsWithToken = allUsers.filter(
    (u) => u.role === "admin" && Boolean(u.jiraTokenEnc)
  );

  console.log("\n📊 BÁO CÁO HIỆN TRẠNG (BASELINE):");
  console.log(`- Tổng số người dùng: ${totalUsers}`);
  console.log(`- Người dùng có token Jira: ${usersWithToken.length}`);
  console.log(`- Người dùng đã có jiraIdentityKey: ${usersWithIdentity.length}`);
  console.log(`- Admin có token Jira: ${adminsWithToken.length}`);

  if (adminsWithToken.length === 0) {
    console.warn("⚠️ CẢNH BÁO: Chưa có admin nào liên kết token Jira! Đảm bảo giữ LEGACY_PASSWORD_LOGIN=1.");
  }

  // 3. Backfill process
  let updatedCount = 0;
  let alreadySetCount = 0;
  let failedCount = 0;
  const collisions: Array<{ userId: string; identityKey: string; conflictingUserId: string }> = [];

  for (const user of usersWithToken) {
    if (user.jiraIdentityKey) {
      alreadySetCount++;
      continue;
    }

    const token = safeDecrypt(user.jiraTokenEnc);
    if (!token) {
      console.warn(`[User ${user.id}] ⚠️ Không thể giải mã token (sai key hoặc token hỏng). Bỏ qua.`);
      failedCount++;
      continue;
    }

    const username = safeDecrypt(user.jiraUserEnc) || user.jiraUsername || undefined;

    // Verify against Jira
    const res = await verifyJiraCredential({ token, username });
    if (!res.ok) {
      console.warn(`[User ${user.id}] ⚠️ Xác thực Jira thất bại (${res.code}): ${res.message}`);
      failedCount++;
      continue;
    }

    // Check collision with other users
    const existingHolder = await prisma.user.findUnique({
      where: { jiraIdentityKey: res.identityKey },
      select: { id: true, email: true },
    });

    if (existingHolder && existingHolder.id !== user.id) {
      console.error(
        `[User ${user.id}] ❌ XUNG ĐỘT DANH TÍNH: identityKey "${res.identityKey}" đã thuộc về User ${existingHolder.id}. Không tự merge!`
      );
      collisions.push({
        userId: user.id,
        identityKey: res.identityKey,
        conflictingUserId: existingHolder.id,
      });
      continue;
    }

    if (isDryRun) {
      console.log(`[User ${user.id}] [DRY-RUN] Sẽ cập nhật jiraIdentityKey="${res.identityKey}"`);
      updatedCount++;
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          jiraIdentityKey: res.identityKey,
          jiraVerifiedAt: new Date(),
          jiraUsername: res.name || user.jiraUsername,
        },
      });
      console.log(`[User ${user.id}] ✅ Đã cập nhật jiraIdentityKey="${res.identityKey}"`);
      updatedCount++;
    }
  }

  // 4. Summary
  console.log("\n=== KẾT QUẢ TỔNG HỢP ===");
  console.log(`- Đã cập nhật thành công: ${updatedCount}`);
  console.log(`- Đã có identity từ trước: ${alreadySetCount}`);
  console.log(`- Lỗi / cần thử lại: ${failedCount}`);
  console.log(`- Xung đột (collision) cần xử lý thủ công: ${collisions.length}`);

  if (collisions.length > 0) {
    console.log("\n⚠️ DANH SÁCH XUNG ĐỘT CẦN ADMIN XỬ LÝ:");
    console.table(collisions);
  }

  console.log("\n=== HOÀN TẤT ===");
}

main()
  .catch((err) => {
    console.error("Lỗi thực thi script:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
