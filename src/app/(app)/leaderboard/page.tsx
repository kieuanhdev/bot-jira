import type { Metadata } from "next";
import { LeaderboardClient } from "./leaderboard-client";

export const metadata: Metadata = {
  title: "Bảng xếp hạng năng suất - Team Task Web",
  description: "Bảng xếp hạng tích lũy Story Point theo tháng, quý, năm và vinh danh cá nhân xuất sắc.",
};

export default function LeaderboardPage() {
  return <LeaderboardClient />;
}
