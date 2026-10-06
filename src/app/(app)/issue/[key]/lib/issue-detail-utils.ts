import { parseJiraDuration } from "@/lib/worklogs/schema";
import type { Transition } from "./issue-detail-types";

export const PRIORITIES = [
  "Blocker",
  "Highest",
  "High",
  "Medium",
  "Low",
  "Lowest",
] as const;

export function transitionTo(t: Transition): string {
  return typeof t.to === "string" ? t.to : t.to?.name ?? t.name ?? "";
}

export function getDefaultLogStartedAt(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function validateWorklog(
  timeSpent: string,
  startedAt: string,
  nowMs: number = Date.now()
): { error?: string; parsedSeconds?: number; startedDate?: Date } {
  const trimmed = timeSpent.trim();
  const parsed = parseJiraDuration(trimmed);
  if (!parsed || parsed <= 0) {
    return {
      error: "Thời lượng không hợp lệ. Vui lòng nhập đúng cú pháp Jira (ví dụ: 30m, 2h, 1d 4h).",
    };
  }

  if (!startedAt) {
    return { error: "Thời điểm bắt đầu là bắt buộc." };
  }

  const startedDate = new Date(startedAt);
  if (isNaN(startedDate.getTime())) {
    return { error: "Thời điểm bắt đầu không hợp lệ." };
  }

  if (startedDate.getTime() - nowMs > 5 * 60 * 1000) {
    return {
      error: "Thời điểm bắt đầu không được lớn hơn hiện tại quá 5 phút.",
    };
  }

  return { parsedSeconds: parsed, startedDate };
}
