import type { BranchRowItem, BranchesQueryResult, CountOption } from "@/lib/bitbucket/branch-query";
import type { AttentionSignal } from "@/lib/bitbucket/branch-risk";
import type {
  DeliveryTaskRow,
  ReviewSuggestionItem,
  UnlinkedBranchItem,
  TaskDeliveryQueryResult,
} from "@/lib/bitbucket/task-delivery-query";

export type {
  BranchRowItem,
  BranchesQueryResult,
  CountOption,
  AttentionSignal,
  DeliveryTaskRow,
  ReviewSuggestionItem,
  UnlinkedBranchItem,
  TaskDeliveryQueryResult,
};

export type WorkspaceView =
  | "my-work"
  | "needs-attention"
  | "pending-review"
  | "unlinked"
  | "all-branches";

export type BranchFilterState = {
  view: WorkspaceView;
  q: string;
  project: string;
  repo: string;
  link: "ALL" | "linked" | "suggested" | "unlinked";
  pr: "ALL" | "none" | "open" | "merged" | "declined" | "closed";
  taskStatus: string;
  assignee: string;
  attention: "0" | "1";
  sort: "attention" | "updated" | "branch" | "repo" | "task";
  order: "asc" | "desc";
  page: number;
  pageSize: number;
};

export const DEFAULT_FILTERS: BranchFilterState = {
  view: "my-work",
  q: "",
  project: "ALL",
  repo: "ALL",
  link: "ALL",
  pr: "ALL",
  taskStatus: "ALL",
  assignee: "ALL",
  attention: "0",
  sort: "updated",
  order: "desc",
  page: 1,
  pageSize: 20,
};
