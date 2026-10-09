export type LeaderboardTierIcon =
  | "Crown"
  | "Sparkles"
  | "Zap"
  | "Flame"
  | "Trophy"
  | "Shield"
  | "Medal"
  | "Star";

export interface LeaderboardTier {
  id: string;
  name: string; // Tên hiển thị đầy đủ, vd: "Luyện Khí • Tầng 1 – 3 (Sơ Kỳ)"
  realm: string; // Tên Đại cảnh giới, vd: "Luyện Khí Kỳ (10 – 13 tầng)"
  layer: string; // Tầng / giai đoạn, vd: "Tầng 1 – 3 (Sơ kỳ)"
  title: string;
  realmSummary: string; // Mô tả tổng quan đại cảnh giới (lore chuẩn tiên hiệp)
  realmDesc: string; // Mô tả chi tiết tiểu cảnh giới / tầng
  minPoints: number;
  badgeClass: string;
  glowClass: string;
  iconName: LeaderboardTierIcon;
}

export interface NextTierProgress {
  nextTier: LeaderboardTier;
  pointsNeeded: number;
  progressPercent: number;
}
