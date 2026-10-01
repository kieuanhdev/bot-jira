import { type BulkCreateProjectMetadata } from "@/lib/bulk/create-types";

export type ColumnId =
  | "select"
  | "index"
  | "summary"
  | "issueType"
  | "parent"
  | "priority"
  | "assignee"
  | "labels"
  | "points"
  | "originalEstimate"
  | "dueDate"
  | "fixVersion"
  | "description"
  | "actions";

export interface ColumnDefinition {
  id: ColumnId;
  label: string;
  shortLabel?: string;
  minWidth: number;
  width?: number;
  canToggle: boolean;
  defaultVisible: boolean;
  isAvailable: (metadata: BulkCreateProjectMetadata) => boolean;
}

export const ALL_COLUMNS: ColumnDefinition[] = [
  {
    id: "select",
    label: "Chọn dòng",
    minWidth: 36,
    width: 36,
    canToggle: false,
    defaultVisible: true,
    isAvailable: () => true,
  },
  {
    id: "index",
    label: "#",
    minWidth: 40,
    width: 40,
    canToggle: false,
    defaultVisible: true,
    isAvailable: () => true,
  },
  {
    id: "summary",
    label: "Tiêu đề (Summary) *",
    shortLabel: "Tiêu đề",
    minWidth: 260,
    width: 320,
    canToggle: false,
    defaultVisible: true,
    isAvailable: () => true,
  },
  {
    id: "issueType",
    label: "Loại task *",
    shortLabel: "Loại task",
    minWidth: 140,
    width: 150,
    canToggle: false,
    defaultVisible: true,
    isAvailable: () => true,
  },
  {
    id: "parent",
    label: "Task cha (Parent)",
    shortLabel: "Parent",
    minWidth: 150,
    width: 170,
    canToggle: true,
    defaultVisible: true,
    isAvailable: (meta) => meta.hasSubtaskTypes,
  },
  {
    id: "priority",
    label: "Mức ưu tiên",
    shortLabel: "Ưu tiên",
    minWidth: 120,
    width: 130,
    canToggle: true,
    defaultVisible: true,
    isAvailable: () => true,
  },
  {
    id: "assignee",
    label: "Người thực hiện",
    shortLabel: "Assignee",
    minWidth: 150,
    width: 160,
    canToggle: true,
    defaultVisible: true,
    isAvailable: () => true,
  },
  {
    id: "labels",
    label: "Nhãn (Labels)",
    shortLabel: "Nhãn",
    minWidth: 140,
    width: 160,
    canToggle: true,
    defaultVisible: true,
    isAvailable: () => true,
  },
  {
    id: "points",
    label: "Story Points",
    shortLabel: "Points",
    minWidth: 90,
    width: 100,
    canToggle: true,
    defaultVisible: true,
    isAvailable: (meta) => Boolean(meta.pointsFieldId),
  },
  {
    id: "originalEstimate",
    label: "Ước tính (Estimate)",
    shortLabel: "Ước tính",
    minWidth: 110,
    width: 120,
    canToggle: true,
    defaultVisible: true,
    isAvailable: (meta) => meta.supportsTimeTracking,
  },
  {
    id: "dueDate",
    label: "Hạn chót (Due date)",
    shortLabel: "Hạn chót",
    minWidth: 130,
    width: 140,
    canToggle: true,
    defaultVisible: true,
    isAvailable: (meta) => meta.supportsDueDate,
  },
  {
    id: "fixVersion",
    label: "Phiên bản (Fix Version)",
    shortLabel: "Phiên bản",
    minWidth: 140,
    width: 150,
    canToggle: true,
    defaultVisible: false,
    isAvailable: (meta) => meta.versionOptions.length > 0,
  },
  {
    id: "description",
    label: "Mô tả công việc",
    shortLabel: "Mô tả",
    minWidth: 180,
    width: 220,
    canToggle: true,
    defaultVisible: true,
    isAvailable: () => true,
  },
  {
    id: "actions",
    label: "Thao tác",
    minWidth: 90,
    width: 90,
    canToggle: false,
    defaultVisible: true,
    isAvailable: () => true,
  },
];

export function getDefaultVisibleColumnIds(metadata: BulkCreateProjectMetadata): ColumnId[] {
  return ALL_COLUMNS.filter((col) => col.defaultVisible && col.isAvailable(metadata)).map(
    (col) => col.id
  );
}

export function getAvailableToggleableColumns(
  metadata: BulkCreateProjectMetadata
): ColumnDefinition[] {
  return ALL_COLUMNS.filter((col) => col.canToggle && col.isAvailable(metadata));
}
