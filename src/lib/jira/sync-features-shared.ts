export const SYNC_FEATURES = {
  comments: {
    label: "Bình luận",
    description: "Lấy comment và gửi thông báo comment",
    category: "jira",
    dependsOn: [] as readonly string[],
    requiresFullSyncOnEnable: true,
  },
  workflow: {
    label: "Trạng thái workflow",
    description: "Cập nhật danh sách trạng thái của dự án",
    category: "jira",
    dependsOn: [] as readonly string[],
    requiresFullSyncOnEnable: false,
  },
  peopleFields: {
    label: "Trường người dùng",
    description: "Dò và đồng bộ trường người tuỳ chỉnh",
    category: "jira",
    dependsOn: [] as readonly string[],
    requiresFullSyncOnEnable: true,
  },
  deletions: {
    label: "Đối soát issue đã xoá",
    description: "Quét định kỳ 20 phút",
    category: "jira",
    dependsOn: [] as readonly string[],
    requiresFullSyncOnEnable: false,
  },
  devStatus: {
    label: "Dev status / nhánh / PR",
    description: "Cần \"Bình luận\" để đọc nhánh từ comment",
    category: "dev",
    dependsOn: [] as readonly string[],
    requiresFullSyncOnEnable: false,
  },
  aiScore: {
    label: "Ước lượng AI",
    description: "Tự động chấm điểm ước lượng các task mở",
    category: "automation",
    dependsOn: [] as readonly string[],
    requiresFullSyncOnEnable: false,
  },
  staleDetect: {
    label: "Phát hiện issue đứng",
    description: "Phát hiện và nhắc nhở task đứng lâu",
    category: "automation",
    dependsOn: [] as readonly string[],
    requiresFullSyncOnEnable: false,
  },
  reportSnapshots: {
    label: "Snapshot báo cáo",
    description: "Tắt thì các ngày bỏ lỡ không chụp lại được",
    category: "automation",
    dependsOn: [] as readonly string[],
    requiresFullSyncOnEnable: false,
  },
  notifications: {
    label: "Thông báo watcher",
    description: "Gửi thông báo thay đổi và comment cho người theo dõi",
    category: "automation",
    dependsOn: [] as readonly string[],
    requiresFullSyncOnEnable: false,
  },
} as const;

export type SyncFeature = keyof typeof SYNC_FEATURES;

export const ALL_SYNC_FEATURES = Object.keys(SYNC_FEATURES) as SyncFeature[];

export type SyncPreset = "full" | "issues_comments" | "issues_only" | "custom";

export const PRESET_DEFINITIONS: Record<
  Exclude<SyncPreset, "custom">,
  Record<SyncFeature, boolean>
> = {
  full: {
    comments: true,
    workflow: true,
    peopleFields: true,
    deletions: true,
    devStatus: true,
    aiScore: true,
    staleDetect: true,
    reportSnapshots: true,
    notifications: true,
  },
  issues_comments: {
    comments: true,
    workflow: true,
    peopleFields: true,
    deletions: true,
    devStatus: false,
    aiScore: false,
    staleDetect: false,
    reportSnapshots: false,
    notifications: true,
  },
  issues_only: {
    comments: false,
    workflow: true,
    peopleFields: false,
    deletions: true,
    devStatus: false,
    aiScore: false,
    staleDetect: false,
    reportSnapshots: false,
    notifications: false,
  },
};

export const PRESET_LABELS: Record<SyncPreset, string> = {
  full: "Đầy đủ",
  issues_comments: "Issue + bình luận",
  issues_only: "Chỉ issue",
  custom: "Tuỳ chỉnh",
};

/** Parse + normalize JSON from DB; unknown keys discarded, missing keys default to true. */
export function resolveSyncFeatures(raw: unknown): Record<SyncFeature, boolean> {
  const result: Record<SyncFeature, boolean> = {
    comments: true,
    workflow: true,
    peopleFields: true,
    deletions: true,
    devStatus: true,
    aiScore: true,
    staleDetect: true,
    reportSnapshots: true,
    notifications: true,
  };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return result;
  }

  const obj = raw as Record<string, unknown>;
  for (const feature of ALL_SYNC_FEATURES) {
    if (typeof obj[feature] === "boolean") {
      result[feature] = obj[feature];
    }
  }

  return result;
}

/** Determine which preset matches the given feature flags. */
export function derivePreset(features: Record<SyncFeature, boolean>): SyncPreset {
  for (const [preset, def] of Object.entries(PRESET_DEFINITIONS) as [
    Exclude<SyncPreset, "custom">,
    Record<SyncFeature, boolean>
  ][]) {
    const isMatch = ALL_SYNC_FEATURES.every((f) => def[f] === features[f]);
    if (isMatch) return preset;
  }
  return "custom";
}

/** Get feature settings corresponding to a preset. */
export function presetToFeatures(
  preset: Exclude<SyncPreset, "custom">
): Record<SyncFeature, boolean> {
  return { ...PRESET_DEFINITIONS[preset] };
}

/** Validate input feature object: rejects unknown keys and non-boolean values. */
export function validateSyncFeatures(
  raw: unknown
):
  | { valid: true; features: Partial<Record<SyncFeature, boolean>> }
  | { valid: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, error: "features must be an object" };
  }

  const obj = raw as Record<string, unknown>;
  const parsed: Partial<Record<SyncFeature, boolean>> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (!ALL_SYNC_FEATURES.includes(key as SyncFeature)) {
      return { valid: false, error: `Hạng mục không hợp lệ: "${key}"` };
    }
    if (typeof value !== "boolean") {
      return { valid: false, error: `Giá trị của "${key}" phải là kiểu boolean` };
    }
    parsed[key as SyncFeature] = value;
  }

  return { valid: true, features: parsed };
}

/** Check if transitioning from before to after requires a full backfill sync. */
export function requiresBackfill(
  before: Record<SyncFeature, boolean>,
  after: Record<SyncFeature, boolean>
): boolean {
  if (!before.comments && after.comments) return true;
  if (!before.peopleFields && after.peopleFields) return true;
  return false;
}

