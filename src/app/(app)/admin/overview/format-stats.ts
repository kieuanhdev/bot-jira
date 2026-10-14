/**
 * Helpers for formatting job stats, cron schedules, and operational labels.
 */

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "0";
  return n.toLocaleString("vi-VN");
}

export const RELEASE_GATE_LABELS: Record<string, string> = {
  ci: "Kiểm tra CI",
  data_freshness: "Độ tươi dữ liệu",
  non_empty_release: "Release không rỗng",
  open_prs: "PR chưa merge",
  tests: "Kiểm thử",
  reviews: "Duyệt mã",
  deployment: "Triển khai",
  dependency_check: "Kiểm tra phụ thuộc",
  security_scan: "Quét bảo mật",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "admin.job.run": "Chạy job thủ công",
  "admin.outbox.retry": "Thử lại thông báo",
  "project.sync_enable": "Bật đồng bộ dự án",
  "project.sync_disable": "Tắt đồng bộ dự án",
  "project.sync_features_update": "Cập nhật hạng mục đồng bộ",
  "release.publish": "Phát hành phiên bản",
  "release.create": "Tạo phiên phát hành",
  "release.override": "Ghi đè cổng kiểm tra",
  "issue.transition": "Chuyển trạng thái issue",
  "user.role": "Phân quyền người dùng",
  "bulk.execute": "Thực thi hàng loạt",
};

export function getAuditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function getReleaseGateLabel(gate: string): string {
  return RELEASE_GATE_LABELS[gate] ?? gate;
}

export type CleanStatEntry = {
  key: string;
  label: string;
  value: string;
  isBadge?: boolean;
  tone?: "success" | "warning" | "danger" | "secondary";
};

export function parseStats(stats: Record<string, unknown> | null | undefined): CleanStatEntry[] {
  if (!stats || typeof stats !== "object") return [];
  const entries: CleanStatEntry[] = [];

  for (const [k, v] of Object.entries(stats)) {
    // Hide standard noise
    if (k === "skipped" && v === false) continue;
    if (k === "reason" && (v === null || v === undefined)) continue;
    if (k === "durationMs" || k === "finishedAt") continue; // Shown in separate columns

    if (k === "skipped" && v === true) {
      const reason = stats.reason ? String(stats.reason) : "Điều kiện bỏ qua";
      entries.push({
        key: k,
        label: "Trạng thái",
        value: `Bỏ qua: ${reason}`,
        isBadge: true,
        tone: "warning",
      });
      continue;
    }

    if (k === "reason" && stats.skipped === true) {
      continue; // Handled together with skipped
    }

    let formattedVal = "";
    if (typeof v === "number") {
      formattedVal = formatNumber(v);
    } else if (typeof v === "boolean") {
      formattedVal = v ? "Có" : "Không";
    } else if (v === null || v === undefined) {
      formattedVal = "—";
    } else if (typeof v === "object") {
      formattedVal = JSON.stringify(v);
    } else {
      formattedVal = String(v);
    }

    entries.push({
      key: k,
      label: k,
      value: formattedVal,
    });
  }

  return entries;
}
