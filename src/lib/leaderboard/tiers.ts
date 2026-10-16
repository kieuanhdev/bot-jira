import type {
  LeaderboardTier,
  NextTierProgress,
  LeaderboardTierIcon,
} from "./contracts/tiers";

export type { LeaderboardTier, NextTierProgress, LeaderboardTierIcon };

/**
 * Danh sách Cảnh Giới Tu Tiên chuẩn chỉ theo phong cách tiên hiệp cổ điển:
 * Phàm Nhân -> Luyện Khí (10 - 13 tầng) -> Trúc Cơ -> Kết Đan (Kim Đan) -> Nguyên Anh -> Hóa Thần (Phi Thăng).
 * Sắp xếp từ cảnh giới cao nhất xuống thấp nhất.
 */
export const LEADERBOARD_TIERS: LeaderboardTier[] = [
  // ── 1. HÓA THẦN KỲ ──────────────────────────────────────────────
  {
    id: "hoa_than_phi_thang",
    name: "Hóa Thần • Đỉnh Phong (Phi Thăng)",
    realm: "Hóa Thần Kỳ",
    layer: "Đỉnh Phong (Phi Thăng)",
    title: "Hóa Thần Đỉnh Phong",
    realmSummary:
      "Thần thức hòa nhập với thiên địa, bắt đầu mượn được uy lực của thiên địa quy tắc thay vì chỉ dùng linh lực tự thân. Đạt đến đỉnh phong cảnh giới này sẽ dẫn động thiên kiếp để phi thăng lên Linh Giới. Tuổi thọ đạt 2.000 – 3.000 năm.",
    realmDesc: "Dẫn động thiên kiếp, phá toái hư không, độ kiếp phi thăng Linh Giới",
    minPoints: 500,
    badgeClass: "bg-warning/25 text-warning border-warning/50 font-black",
    glowClass: "ring-warning/60 shadow-warning/40",
    iconName: "Crown",
  },
  {
    id: "hoa_than_hau_ky",
    name: "Hóa Thần • Hậu Kỳ",
    realm: "Hóa Thần Kỳ",
    layer: "Hậu Kỳ",
    title: "Hóa Thần Tôn Giả",
    realmSummary:
      "Thần thức hòa nhập với thiên địa, bắt đầu mượn được uy lực của thiên địa quy tắc thay vì chỉ dùng linh lực tự thân. Đạt đến đỉnh phong cảnh giới này sẽ dẫn động thiên kiếp để phi thăng lên Linh Giới. Tuổi thọ đạt 2.000 – 3.000 năm.",
    realmDesc: "Thần niệm bao trùm vạn dặm, chưởng khống thiên địa quy tắc đại thành",
    minPoints: 420,
    badgeClass: "bg-warning/20 text-warning border-warning/40 font-bold",
    glowClass: "ring-warning/50 shadow-warning/30",
    iconName: "Crown",
  },
  {
    id: "hoa_than_trung_ky",
    name: "Hóa Thần • Trung Kỳ",
    realm: "Hóa Thần Kỳ",
    layer: "Trung Kỳ",
    title: "Hóa Thần Chân Nhân",
    realmSummary:
      "Thần thức hòa nhập với thiên địa, bắt đầu mượn được uy lực của thiên địa quy tắc thay vì chỉ dùng linh lực tự thân. Đạt đến đỉnh phong cảnh giới này sẽ dẫn động thiên kiếp để phi thăng lên Linh Giới. Tuổi thọ đạt 2.000 – 3.000 năm.",
    realmDesc: "Thần thức hòa nhập thiên địa, mượn uy lực thiên địa quy tắc định đoạt càn khôn",
    minPoints: 350,
    badgeClass: "bg-primary/20 text-primary border-primary/40 font-bold",
    glowClass: "ring-primary/50 shadow-primary/30",
    iconName: "Zap",
  },
  {
    id: "hoa_than_so_ky",
    name: "Hóa Thần • Sơ Kỳ",
    realm: "Hóa Thần Kỳ",
    layer: "Sơ Kỳ",
    title: "Hóa Thần Sơ Nhập",
    realmSummary:
      "Thần thức hòa nhập với thiên địa, bắt đầu mượn được uy lực của thiên địa quy tắc thay vì chỉ dùng linh lực tự thân. Đạt đến đỉnh phong cảnh giới này sẽ dẫn động thiên kiếp để phi thăng lên Linh Giới. Tuổi thọ đạt 2.000 – 3.000 năm.",
    realmDesc: "Nguyên Anh thuế biến, bước đầu mượn được uy lực của thiên địa quy tắc",
    minPoints: 290,
    badgeClass: "bg-primary/15 text-primary border-primary/35 font-semibold",
    glowClass: "ring-primary/40 shadow-primary/20",
    iconName: "Zap",
  },

  // ── 2. NGUYÊN ANH KỲ ────────────────────────────────────────────
  {
    id: "nguyen_anh_vien_man",
    name: "Nguyên Anh • Đại Viên Mãn",
    realm: "Nguyên Anh Kỳ",
    layer: "Đại Viên Mãn",
    title: "Nguyên Anh Lão Tổ",
    realmSummary:
      "Kim Đan vỡ ra, hóa thành một 'tiểu hài tử' năng lượng gọi là Nguyên Anh. Nếu thể xác bị hủy, Nguyên Anh có thể thoát ra ngoài đoạt xá hoặc tự tu luyện tiếp. Tuổi thọ vượt 1.000 năm, có khả năng dịch chuyển tức thời (ấn chuyển / thuấn di).",
    realmDesc: "Nguyên Anh thuần dương đại thành, pháp lực ngập trời, chuẩn bị hóa thần",
    minPoints: 240,
    badgeClass: "bg-info/20 text-info border-info/40 font-bold",
    glowClass: "ring-info/50 shadow-info/30",
    iconName: "Flame",
  },
  {
    id: "nguyen_anh_hau_ky",
    name: "Nguyên Anh • Hậu Kỳ",
    realm: "Nguyên Anh Kỳ",
    layer: "Hậu Kỳ",
    title: "Nguyên Anh Đại Năng",
    realmSummary:
      "Kim Đan vỡ ra, hóa thành một 'tiểu hài tử' năng lượng gọi là Nguyên Anh. Nếu thể xác bị hủy, Nguyên Anh có thể thoát ra ngoài đoạt xá hoặc tự tu luyện tiếp. Tuổi thọ vượt 1.000 năm, có khả năng dịch chuyển tức thời (ấn chuyển / thuấn di).",
    realmDesc: "Thần thông cái thế, thuấn di vạn dặm, pháp lực vô biên",
    minPoints: 195,
    badgeClass: "bg-info/15 text-info border-info/35 font-semibold",
    glowClass: "ring-info/40 shadow-info/20",
    iconName: "Flame",
  },
  {
    id: "nguyen_anh_trung_ky",
    name: "Nguyên Anh • Trung Kỳ",
    realm: "Nguyên Anh Kỳ",
    layer: "Trung Kỳ",
    title: "Nguyên Anh Chân Nhân",
    realmSummary:
      "Kim Đan vỡ ra, hóa thành một 'tiểu hài tử' năng lượng gọi là Nguyên Anh. Nếu thể xác bị hủy, Nguyên Anh có thể thoát ra ngoài đoạt xá hoặc tự tu luyện tiếp. Tuổi thọ vượt 1.000 năm, có khả năng dịch chuyển tức thời (ấn chuyển / thuấn di).",
    realmDesc: "Nguyên Anh thành thục, có thể ly thể xuất khiếu đoạt xá bảo toàn tính mạng",
    minPoints: 155,
    badgeClass: "bg-info/15 text-info border-info/30 font-semibold",
    glowClass: "ring-info/30 shadow-info/15",
    iconName: "Flame",
  },
  {
    id: "nguyen_anh_so_ky",
    name: "Nguyên Anh • Sơ Kỳ",
    realm: "Nguyên Anh Kỳ",
    layer: "Sơ Kỳ",
    title: "Nguyên Anh Sơ Khởi",
    realmSummary:
      "Kim Đan vỡ ra, hóa thành một 'tiểu hài tử' năng lượng gọi là Nguyên Anh. Nếu thể xác bị hủy, Nguyên Anh có thể thoát ra ngoài đoạt xá hoặc tự tu luyện tiếp. Tuổi thọ vượt 1.000 năm, có khả năng dịch chuyển tức thời (ấn chuyển / thuấn di).",
    realmDesc: "Phá đan hóa anh, thọ mệnh ngàn năm, bắt đầu nắm giữ thuấn di",
    minPoints: 120,
    badgeClass: "bg-info/15 text-info border-info/30 font-semibold",
    glowClass: "ring-info/30 shadow-info/15",
    iconName: "Flame",
  },

  // ── 3. KẾT ĐAN KỲ (KIM ĐAN KỲ) ──────────────────────────────────
  {
    id: "kim_dan_vien_man",
    name: "Kết Đan • Đại Viên Mãn",
    realm: "Kết Đan Kỳ (Kim Đan Kỳ)",
    layer: "Đại Viên Mãn",
    title: "Kim Đan Đại Thành",
    realmSummary:
      "Chân nguyên dạng lỏng kết tụ, cô đọng thành viên Kim Đan tròn trịa nơi đan điền. Linh lực dồi dào gấp bội, bắt đầu điều khiển được pháp bảo bản mệnh. Tuổi thọ đạt khoảng 500 – 800 năm.",
    realmDesc: "Kim đan cửu chuyển viên mãn, đan hỏa thuần thục, chuẩn bị hóa anh",
    minPoints: 95,
    badgeClass: "bg-success/20 text-success border-success/40 font-medium",
    glowClass: "ring-success/50 shadow-success/30",
    iconName: "Trophy",
  },
  {
    id: "kim_dan_hau_ky",
    name: "Kết Đan • Hậu Kỳ",
    realm: "Kết Đan Kỳ (Kim Đan Kỳ)",
    layer: "Hậu Kỳ",
    title: "Kim Đan Chân Sư",
    realmSummary:
      "Chân nguyên dạng lỏng kết tụ, cô đọng thành viên Kim Đan tròn trịa nơi đan điền. Linh lực dồi dào gấp bội, bắt đầu điều khiển được pháp bảo bản mệnh. Tuổi thọ đạt khoảng 500 – 800 năm.",
    realmDesc: "Điều khiển pháp bảo bản mệnh xuất thần nhập hóa, thọ nguyên trường thọ",
    minPoints: 75,
    badgeClass: "bg-success/15 text-success border-success/35 font-medium",
    glowClass: "ring-success/40 shadow-success/20",
    iconName: "Trophy",
  },
  {
    id: "kim_dan_trung_ky",
    name: "Kết Đan • Trung Kỳ",
    realm: "Kết Đan Kỳ (Kim Đan Kỳ)",
    layer: "Trung Kỳ",
    title: "Kim Đan Chân Nhân",
    realmSummary:
      "Chân nguyên dạng lỏng kết tụ, cô đọng thành viên Kim Đan tròn trịa nơi đan điền. Linh lực dồi dào gấp bội, bắt đầu điều khiển được pháp bảo bản mệnh. Tuổi thọ đạt khoảng 500 – 800 năm.",
    realmDesc: "Đan khí ngưng kết vững vàng, linh lực dồi dào gấp bội nơi đan điền",
    minPoints: 58,
    badgeClass: "bg-success/15 text-success border-success/35 font-medium",
    glowClass: "ring-success/35 shadow-success/15",
    iconName: "Trophy",
  },
  {
    id: "kim_dan_so_ky",
    name: "Kết Đan • Sơ Kỳ",
    realm: "Kết Đan Kỳ (Kim Đan Kỳ)",
    layer: "Sơ Kỳ",
    title: "Kim Đan Sơ Kết",
    realmSummary:
      "Chân nguyên dạng lỏng kết tụ, cô đọng thành viên Kim Đan tròn trịa nơi đan điền. Linh lực dồi dào gấp bội, bắt đầu điều khiển được pháp bảo bản mệnh. Tuổi thọ đạt khoảng 500 – 800 năm.",
    realmDesc: "Chân nguyên cô đọng thành Kim Đan tròn trịa, bắt đầu điều khiển pháp bảo bản mệnh",
    minPoints: 44,
    badgeClass: "bg-success/15 text-success border-success/30 font-medium",
    glowClass: "ring-success/30 shadow-success/15",
    iconName: "Trophy",
  },

  // ── 4. TRÚC CƠ KỲ ───────────────────────────────────────────────
  {
    id: "truc_co_vien_man",
    name: "Trúc Cơ • Đại Viên Mãn",
    realm: "Trúc Cơ Kỳ",
    layer: "Đại Viên Mãn",
    title: "Trúc Cơ Viên Mãn",
    realmSummary:
      "Linh khí dạng khí trong đan điền ngưng tụ thành dạng lỏng (chân nguyên), đúc thành 'đạo cơ'. Tuổi thọ tăng lên khoảng 200 – 300 năm, có thể ngự kiếm phi hành.",
    realmDesc: "Đạo cơ viên mãn, linh dịch hóa hải, chuẩn bị ngưng kết kim đan",
    minPoints: 34,
    badgeClass: "bg-info/20 text-info border-info/40 font-medium",
    glowClass: "ring-info/40 shadow-info/20",
    iconName: "Shield",
  },
  {
    id: "truc_co_hau_ky",
    name: "Trúc Cơ • Hậu Kỳ",
    realm: "Trúc Cơ Kỳ",
    layer: "Hậu Kỳ",
    title: "Trúc Cơ Đạo Sĩ",
    realmSummary:
      "Linh khí dạng khí trong đan điền ngưng tụ thành dạng lỏng (chân nguyên), đúc thành 'đạo cơ'. Tuổi thọ tăng lên khoảng 200 – 300 năm, có thể ngự kiếm phi hành.",
    realmDesc: "Chân nguyên dồi dào, ngự kiếm phi hành nhanh như chớp giật",
    minPoints: 26,
    badgeClass: "bg-info/15 text-info border-info/35 font-medium",
    glowClass: "ring-info/35 shadow-info/15",
    iconName: "Shield",
  },
  {
    id: "truc_co_trung_ky",
    name: "Trúc Cơ • Trung Kỳ",
    realm: "Trúc Cơ Kỳ",
    layer: "Trung Kỳ",
    title: "Trúc Cơ Tu Sĩ",
    realmSummary:
      "Linh khí dạng khí trong đan điền ngưng tụ thành dạng lỏng (chân nguyên), đúc thành 'đạo cơ'. Tuổi thọ tăng lên khoảng 200 – 300 năm, có thể ngự kiếm phi hành.",
    realmDesc: "Chân nguyên lỏng hóa toàn diện, đúc thành đạo cơ vững bền",
    minPoints: 19,
    badgeClass: "bg-info/15 text-info border-info/30 font-medium",
    glowClass: "ring-info/30 shadow-info/15",
    iconName: "Shield",
  },
  {
    id: "truc_co_so_ky",
    name: "Trúc Cơ • Sơ Kỳ",
    realm: "Trúc Cơ Kỳ",
    layer: "Sơ Kỳ",
    title: "Trúc Cơ Sơ Nhập",
    realmSummary:
      "Linh khí dạng khí trong đan điền ngưng tụ thành dạng lỏng (chân nguyên), đúc thành 'đạo cơ'. Tuổi thọ tăng lên khoảng 200 – 300 năm, có thể ngự kiếm phi hành.",
    realmDesc: "Linh khí ngưng tụ thành dạng lỏng, chính thức ngự kiếm phi hành",
    minPoints: 13,
    badgeClass: "bg-info/15 text-info border-info/30 font-medium",
    glowClass: "ring-info/30 shadow-info/15",
    iconName: "Shield",
  },

  // ── 5. LUYỆN KHÍ KỲ ─────────────────────────────────────────────
  {
    id: "luyen_khi_vien_man",
    name: "Luyện Khí • Đại Viên Mãn",
    realm: "Luyện Khí Kỳ",
    layer: "Đại Viên Mãn",
    title: "Luyện Khí Đỉnh Phong",
    realmSummary:
      "Giai đoạn nhập môn, người tu hành cảm ứng và hấp thu linh khí thiên địa vào kinh mạch để thanh lọc cơ thể, kéo dài tuổi thọ nhẹ (khoảng 100 – 120 tuổi).",
    realmDesc: "Linh khí sung mãn tràn đầy kinh mạch, chuẩn bị Trúc Cơ ngưng dịch",
    minPoints: 9,
    badgeClass: "bg-info/20 text-info border-info/40 font-medium",
    glowClass: "ring-info/40 shadow-info/20",
    iconName: "Medal",
  },
  {
    id: "luyen_khi_hau_ky",
    name: "Luyện Khí • Hậu Kỳ",
    realm: "Luyện Khí Kỳ",
    layer: "Hậu Kỳ",
    title: "Luyện Khí Hậu Kỳ",
    realmSummary:
      "Giai đoạn nhập môn, người tu hành cảm ứng và hấp thu linh khí thiên địa vào kinh mạch để thanh lọc cơ thể, kéo dài tuổi thọ nhẹ (khoảng 100 – 120 tuổi).",
    realmDesc: "Kinh mạch kiên cố, linh khí lưu chuyển chu thiên thuần thục",
    minPoints: 6,
    badgeClass: "bg-info/15 text-info border-info/35 font-medium",
    glowClass: "ring-info/35 shadow-info/15",
    iconName: "Medal",
  },
  {
    id: "luyen_khi_trung_ky",
    name: "Luyện Khí • Trung Kỳ",
    realm: "Luyện Khí Kỳ",
    layer: "Trung Kỳ",
    title: "Luyện Khí Trung Kỳ",
    realmSummary:
      "Giai đoạn nhập môn, người tu hành cảm ứng và hấp thu linh khí thiên địa vào kinh mạch để thanh lọc cơ thể, kéo dài tuổi thọ nhẹ (khoảng 100 – 120 tuổi).",
    realmDesc: "Đả thông kinh mạch, linh khí dần tích tụ vào đan điền",
    minPoints: 3,
    badgeClass: "bg-info/15 text-info border-info/30 font-medium",
    glowClass: "ring-info/30 shadow-info/15",
    iconName: "Medal",
  },
  {
    id: "luyen_khi_so_ky",
    name: "Luyện Khí • Sơ Kỳ",
    realm: "Luyện Khí Kỳ",
    layer: "Sơ Kỳ",
    title: "Sơ Nhập Tiên Môn",
    realmSummary:
      "Giai đoạn nhập môn, người tu hành cảm ứng và hấp thu linh khí thiên địa vào kinh mạch để thanh lọc cơ thể, kéo dài tuổi thọ nhẹ (khoảng 100 – 120 tuổi).",
    realmDesc: "Cảm ứng và hấp thu linh khí thiên địa vào kinh mạch để thanh lọc cơ thể",
    minPoints: 1,
    badgeClass: "bg-info/15 text-info border-info/30 font-medium",
    glowClass: "ring-info/30 shadow-info/15",
    iconName: "Medal",
  },

  // ── 6. PHÀM NHÂN ────────────────────────────────────────────────
  {
    id: "pham_nhan",
    name: "Phàm Nhân",
    realm: "Phàm Nhân",
    layer: "Chưa Khai Linh Căn",
    title: "Phàm Thể Nhập Đạo",
    realmSummary: "Chưa khai mở linh căn, đang tầm tiên vấn đạo, chờ cơ duyên khai ngộ.",
    realmDesc: "Chưa khai mở linh căn, đang tầm tiên vấn đạo, chờ cơ duyên khai ngộ",
    minPoints: 0,
    badgeClass: "bg-muted text-muted-foreground border-border",
    glowClass: "ring-border shadow-muted",
    iconName: "Star",
  },
];

export function getTier(points: number): LeaderboardTier {
  for (const tier of LEADERBOARD_TIERS) {
    if (points >= tier.minPoints) return tier;
  }
  return LEADERBOARD_TIERS[LEADERBOARD_TIERS.length - 1];
}

export function getNextTier(points: number): NextTierProgress | null {
  const currentTier = getTier(points);
  const currentIdx = LEADERBOARD_TIERS.findIndex((t) => t.id === currentTier.id);
  if (currentIdx <= 0) {
    return {
      nextTier: currentTier,
      pointsNeeded: 0,
      progressPercent: 100,
    };
  }

  const nextTier = LEADERBOARD_TIERS[currentIdx - 1];
  const pointsInCurrentTier = points - currentTier.minPoints;
  const tierSpan = nextTier.minPoints - currentTier.minPoints;
  const progressPercent =
    tierSpan > 0 ? Math.min(100, Math.round((pointsInCurrentTier / tierSpan) * 100)) : 100;
  const pointsNeeded = Math.max(0, nextTier.minPoints - points);

  return {
    nextTier,
    pointsNeeded,
    progressPercent,
  };
}
