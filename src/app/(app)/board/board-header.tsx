"use client";

import { LayoutGrid, List, ChevronsUpDown, User, Users } from "lucide-react";
import { SegmentedControl } from "@/components/shared/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BoardProjectTabs } from "./board-project-tabs";
import { BoardSyncButton } from "./board-sync-button";
import { BoardColumnsMenu } from "./board-columns-menu";
import type { BoardSyncState, SortMode, ViewMode } from "./lib/board-types";
import type { BoardColumn as BoardColumnType } from "./lib/board-columns";
import type { IssueItem } from "@/hooks/use-issues";
import type { BoardWidth } from "@/lib/status-groups";

export interface BoardHeaderProps {
  projectList: Array<{ key: string; openCount: number }>;
  selectedProject: string;
  showPicker: boolean;
  preferredCount: number;
  availableKeys: string[];
  pickerSet: Set<string>;
  countMap: Map<string, number>;
  boardNewKey: string;
  boardValidating: boolean;
  boardValidateError: string | null;
  onSelectProject: (key: string) => void;
  onPrefetchProject?: (key: string) => void;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onTogglePicker: (key: string) => void;
  onSelectAllKeys: () => void;
  onCommit: () => void;
  onKeyChange: (key: string) => void;
  onAddProject: () => void;

  boardSync: {
    projectKey: string;
    state: BoardSyncState;
    acceptedAt?: string;
    pollStartMs?: number;
  };
  isCurrentProjectSyncing: boolean;
  isFetching: boolean;
  onSync: () => void;

  effectiveView: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  width: BoardWidth;
  canUseTeamMode: boolean;
  teamMode: boolean;
  onTeamModeChange: (enabled: boolean) => void;

  columns: BoardColumnType[];
  visibleColumns: BoardColumnType[];
  byColumn: Map<string, IssueItem[]>;
  hiddenCols: Set<string>;
  collapsedCols: Set<string>;
  hiddenTableCols: Set<string>;
  onShowAllColumns: () => void;
  onHideEmptyColumns: () => void;
  onToggleColumnVisibility: (key: string) => void;
  onCollapseEmptyColumns: () => void;
  onExpandAllCollapsedColumns: () => void;
  onResetColumnPreferences: () => void;
  onToggleTableColumn: (key: string) => void;
  onResetTableColumns: () => void;

  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
}

export function BoardHeader({
  projectList,
  selectedProject,
  showPicker,
  preferredCount,
  availableKeys,
  pickerSet,
  countMap,
  boardNewKey,
  boardValidating,
  boardValidateError,
  onSelectProject,
  onPrefetchProject,
  onOpenPicker,
  onClosePicker,
  onTogglePicker,
  onSelectAllKeys,
  onCommit,
  onKeyChange,
  onAddProject,

  boardSync,
  isCurrentProjectSyncing,
  isFetching,
  onSync,

  effectiveView,
  onViewChange,
  width,
  canUseTeamMode,
  teamMode,
  onTeamModeChange,

  columns,
  visibleColumns,
  byColumn,
  hiddenCols,
  collapsedCols,
  hiddenTableCols,
  onShowAllColumns,
  onHideEmptyColumns,
  onToggleColumnVisibility,
  onCollapseEmptyColumns,
  onExpandAllCollapsedColumns,
  onResetColumnPreferences,
  onToggleTableColumn,
  onResetTableColumns,

  sortMode,
  onSortModeChange,
}: BoardHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <BoardProjectTabs
          projectList={projectList}
          selectedProject={selectedProject}
          showPicker={showPicker}
          preferredCount={preferredCount}
          availableKeys={availableKeys}
          pickerSet={pickerSet}
          countMap={countMap}
          boardNewKey={boardNewKey}
          boardValidating={boardValidating}
          boardValidateError={boardValidateError}
          onSelectProject={onSelectProject}
          onPrefetchProject={onPrefetchProject}
          onOpenPicker={onOpenPicker}
          onClosePicker={onClosePicker}
          onTogglePicker={onTogglePicker}
          onSelectAllKeys={onSelectAllKeys}
          onCommit={onCommit}
          onKeyChange={onKeyChange}
          onAddProject={onAddProject}
        />
      </div>

      <div className="flex items-center gap-2">
        {canUseTeamMode && (
          <SegmentedControl<"personal" | "team">
            items={[
              { value: "personal", label: "Cá nhân", icon: User },
              { value: "team", label: "Team", icon: Users },
            ]}
            value={teamMode ? "team" : "personal"}
            onChange={(mode) => onTeamModeChange(mode === "team")}
            aria-label="Phạm vi board"
          />
        )}
        <BoardSyncButton
          boardSync={boardSync}
          selectedProject={selectedProject}
          isCurrentProjectSyncing={isCurrentProjectSyncing}
          isFetching={isFetching}
          onSync={onSync}
        />
        <SegmentedControl<ViewMode>
          items={[
            { value: "board", label: "Bảng", icon: LayoutGrid, disabled: width === "narrow" },
            { value: "list", label: "Danh sách", icon: List },
          ]}
          value={effectiveView}
          onChange={onViewChange}
          aria-label="Chế độ hiển thị"
        />

        <BoardColumnsMenu
          effectiveView={effectiveView}
          columns={columns}
          visibleColumns={visibleColumns}
          byColumn={byColumn}
          hiddenCols={hiddenCols}
          collapsedCols={collapsedCols}
          hiddenTableCols={hiddenTableCols}
          selectedProject={selectedProject}
          onShowAll={onShowAllColumns}
          onHideEmpty={onHideEmptyColumns}
          onToggleColumn={onToggleColumnVisibility}
          onCollapseEmpty={onCollapseEmptyColumns}
          onExpandAll={onExpandAllCollapsedColumns}
          onResetColumns={onResetColumnPreferences}
          onToggleTableColumn={onToggleTableColumn}
          onResetTableColumns={onResetTableColumns}
        />

        <Select value={sortMode} onValueChange={(v) => onSortModeChange(v as SortMode)}>
          <SelectTrigger className="h-8 w-auto gap-1.5 text-sm" title="Sắp xếp thẻ trong từng cột">
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="priority">Độ ưu tiên</SelectItem>
            <SelectItem value="updated">Mới cập nhật</SelectItem>
            <SelectItem value="age">Cũ nhất trước</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
