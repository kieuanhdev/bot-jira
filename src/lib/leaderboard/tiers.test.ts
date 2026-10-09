import { describe, it, expect } from "vitest";
import { getTier, getNextTier, LEADERBOARD_TIERS } from "./tiers";

describe("Leaderboard Tiers & Progression", () => {
  it("contains 21 tiered realms ordered from highest to lowest points", () => {
    expect(LEADERBOARD_TIERS.length).toBe(21);
    for (let i = 0; i < LEADERBOARD_TIERS.length - 1; i++) {
      expect(LEADERBOARD_TIERS[i].minPoints).toBeGreaterThan(LEADERBOARD_TIERS[i + 1].minPoints);
    }
    expect(LEADERBOARD_TIERS[LEADERBOARD_TIERS.length - 1].id).toBe("pham_nhan");
    expect(LEADERBOARD_TIERS[LEADERBOARD_TIERS.length - 1].minPoints).toBe(0);
  });

  it("resolves correct tier boundaries", () => {
    expect(getTier(0).name).toBe("Phàm Nhân");
    expect(getTier(1).name).toBe("Luyện Khí • Sơ Kỳ");
    expect(getTier(2).name).toBe("Luyện Khí • Sơ Kỳ");
    expect(getTier(3).name).toBe("Luyện Khí • Trung Kỳ");
    expect(getTier(6).name).toBe("Luyện Khí • Hậu Kỳ");
    expect(getTier(9).name).toBe("Luyện Khí • Đại Viên Mãn");
    expect(getTier(13).name).toBe("Trúc Cơ • Sơ Kỳ");
    expect(getTier(19).name).toBe("Trúc Cơ • Trung Kỳ");
    expect(getTier(26).name).toBe("Trúc Cơ • Hậu Kỳ");
    expect(getTier(34).name).toBe("Trúc Cơ • Đại Viên Mãn");
    expect(getTier(44).name).toBe("Kết Đan • Sơ Kỳ");
    expect(getTier(58).name).toBe("Kết Đan • Trung Kỳ");
    expect(getTier(75).name).toBe("Kết Đan • Hậu Kỳ");
    expect(getTier(95).name).toBe("Kết Đan • Đại Viên Mãn");
    expect(getTier(120).name).toBe("Nguyên Anh • Sơ Kỳ");
    expect(getTier(155).name).toBe("Nguyên Anh • Trung Kỳ");
    expect(getTier(195).name).toBe("Nguyên Anh • Hậu Kỳ");
    expect(getTier(240).name).toBe("Nguyên Anh • Đại Viên Mãn");
    expect(getTier(290).name).toBe("Hóa Thần • Sơ Kỳ");
    expect(getTier(350).name).toBe("Hóa Thần • Trung Kỳ");
    expect(getTier(420).name).toBe("Hóa Thần • Hậu Kỳ");
    expect(getTier(500).name).toBe("Hóa Thần • Đỉnh Phong (Phi Thăng)");
    expect(getTier(1000).name).toBe("Hóa Thần • Đỉnh Phong (Phi Thăng)");
  });

  it("calculates next tier progression and points needed", () => {
    const rookie = getNextTier(0);
    expect(rookie?.nextTier.name).toBe("Luyện Khí • Sơ Kỳ");
    expect(rookie?.pointsNeeded).toBe(1);
    expect(rookie?.progressPercent).toBe(0);

    const luyenKhi = getNextTier(2);
    expect(luyenKhi?.nextTier.name).toBe("Luyện Khí • Trung Kỳ");
    expect(luyenKhi?.pointsNeeded).toBe(1);
    expect(luyenKhi?.progressPercent).toBe(50); // (2-1)/(3-1) = 50%

    const maxTier = getNextTier(500);
    expect(maxTier?.nextTier.name).toBe("Hóa Thần • Đỉnh Phong (Phi Thăng)");
    expect(maxTier?.pointsNeeded).toBe(0);
    expect(maxTier?.progressPercent).toBe(100);

    const beyondMax = getNextTier(999);
    expect(beyondMax?.nextTier.name).toBe("Hóa Thần • Đỉnh Phong (Phi Thăng)");
    expect(beyondMax?.pointsNeeded).toBe(0);
    expect(beyondMax?.progressPercent).toBe(100);
  });
});
