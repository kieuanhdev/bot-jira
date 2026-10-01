import type { Metadata } from "next";
import { LeaderboardClient } from "./leaderboard-client";

export const metadata: Metadata = {
  title: "Bảng Phong Thần Tu Tiên - Team Task Web",
  description: "Bảng xếp hạng cảnh giới tu vi, tích lũy Story Point theo chu kỳ và vinh danh đạo hữu xuất sắc tông môn.",
};

export default function LeaderboardPage() {
  return <LeaderboardClient />;
}
