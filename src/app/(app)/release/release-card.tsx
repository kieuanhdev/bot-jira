"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Rocket,
  CheckCircle2,
  Clock,
  AlertCircle,
  Archive,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Calendar,
  Save,
  Loader2,
  FileText,
  ListTodo,
  ExternalLink,
} from "lucide-react";
import { useSaveReleaseNotes } from "@/hooks/use-releases";
import { ReleaseTaskList } from "./release-task-list";
import { ReleasePublishDialog } from "./release-publish-dialog";
import type { TaskReadinessResult, ReleaseReadinessState } from "@/lib/releases/release-readiness";

export function getJiraVersionUrl(
  jiraBaseUrl?: string | null,
  projectKey?: string,
  jiraVersionId?: string | null,
  versionName?: string
): string | null {
  if (!jiraBaseUrl || !projectKey) return null;
  const base = jiraBaseUrl.replace(/\/$/, "");
  if (jiraVersionId) {
    return `${base}/projects/${encodeURIComponent(projectKey)}/versions/${encodeURIComponent(jiraVersionId)}`;
  }
  if (versionName) {
    return `${base}/issues/?jql=project%20%3D%20%22${encodeURIComponent(projectKey)}%22%20AND%20fixVersion%20%3D%20%22${encodeURIComponent(versionName)}%22`;
  }
  return null;
}

export interface ReleaseCardItem {
  id: string;
  version: string;
  projectKey: string;
  jiraVersionId?: string | null;
  description?: string;
  releaseDate?: string | null;
  releasedAt?: string | null;
  status: string;
  archived: boolean;
  readiness: ReleaseReadinessState;
  taskCount: number;
  doneCount: number;
  gitCompleteCount: number;
  deliveryReadyCount: number;
  tasks: TaskReadinessResult[];
  notes?: string;
  lastSyncedAt?: string | null;
}

interface ReleaseCardProps {
  release: ReleaseCardItem;
  canManage: boolean;
  canPublish: boolean;
  jiraBaseUrl?: string;
  onRefresh: () => void;
}

export function ReleaseCard({
  release,
  canManage,
  canPublish,
  jiraBaseUrl,
  onRefresh,
}: ReleaseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [notes, setNotes] = useState(release.notes || "");
  const [activeTab, setActiveTab] = useState("tasks");

  const notesMutation = useSaveReleaseNotes();

  const isReleased = release.status === "released" || release.readiness === "released";
  const isReady = !isReleased && !release.archived && release.readiness === "ready";

  const jiraPct = release.taskCount > 0 ? Math.round((release.doneCount / release.taskCount) * 100) : 0;
  const deliveryPct = release.taskCount > 0 ? Math.round((release.deliveryReadyCount / release.taskCount) * 100) : 0;

  const versionUrl = getJiraVersionUrl(
    jiraBaseUrl,
    release.projectKey,
    release.jiraVersionId,
    release.version
  );

  const handleSaveNotes = () => {
    notesMutation.mutate({ id: release.id, notes }, { onSuccess: onRefresh });
  };

  return (
    <>
      <Card
        className={`border-border bg-card transition-all duration-200 hover:border-primary/30 ${
          release.archived ? "opacity-75 bg-muted/10" : ""
        }`}
      >
        <CardHeader className="p-4 sm:p-5 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-lg bg-muted shrink-0 text-primary">
                {isReleased ? (
                  <Rocket className="h-5 w-5 text-emerald-500" aria-hidden="true" />
                ) : isReady ? (
                  <CheckCircle2 className="h-5 w-5 text-teal-500" aria-hidden="true" />
                ) : (
                  <GitBranch className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs px-2 py-0.5">
                    {release.projectKey}
                  </Badge>
                  {versionUrl ? (
                    <a
                      href={versionUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 group text-foreground hover:text-primary transition-colors cursor-pointer"
                      title={`Mở phiên bản ${release.version} trên Jira`}
                    >
                      <CardTitle className="text-base font-bold text-inherit truncate group-hover:underline">
                        {release.version}
                      </CardTitle>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" aria-hidden="true" />
                    </a>
                  ) : (
                    <CardTitle className="text-base font-bold text-foreground truncate">
                      {release.version}
                    </CardTitle>
                  )}
                  {renderStatusBadge(release)}
                </div>

                {release.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                    {release.description}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              {canPublish && !isReleased && !release.archived && (
                <Button
                  size="sm"
                  onClick={() => setPublishDialogOpen(true)}
                  className={`gap-1.5 cursor-pointer text-xs font-semibold ${
                    isReady
                      ? "bg-teal-600 hover:bg-teal-700 text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  title={
                    isReady
                      ? "Phát hành phiên bản lên Jira"
                      : "Chưa đủ điều kiện phát hành (bấm để xem chi tiết)"
                  }
                >
                  <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
                  Phát hành trên Jira
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
                className="h-8 px-2 text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label={expanded ? "Thu gọn" : "Mở rộng chi tiết"}
              >
                {expanded ? (
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-0 space-y-3">
          {/* Progress row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-muted/20 border border-border/50 text-xs">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-muted-foreground font-medium">Tiến độ Jira:</span>
                <span className="font-semibold text-foreground">
                  {release.doneCount} / {release.taskCount} task Done ({jiraPct}%)
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${jiraPct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-muted-foreground font-medium">Tiến độ Git Delivery:</span>
                <span className="font-semibold text-foreground">
                  {release.deliveryReadyCount} / {release.taskCount} task sẵn sàng ({deliveryPct}%)
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all duration-300"
                  style={{ width: `${deliveryPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Dates metadata */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground pt-1">
            <div className="flex items-center gap-3">
              {release.releaseDate && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" aria-hidden="true" />
                  Dự kiến: {new Date(release.releaseDate).toLocaleDateString("vi-VN")}
                </span>
              )}
              {release.releasedAt && (
                <span className="inline-flex items-center gap-1 text-emerald-500 font-medium">
                  <Rocket className="h-3 w-3" aria-hidden="true" />
                  Đã phát hành: {new Date(release.releasedAt).toLocaleDateString("vi-VN")}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-primary hover:underline font-medium cursor-pointer"
            >
              {expanded ? "Ẩn danh sách công việc" : `Xem chi tiết ${release.taskCount} task`}
            </button>
          </div>

          {/* Expanded sections */}
          {expanded && (
            <div className="pt-3 border-t border-border mt-3">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-muted/50 p-1 mb-3">
                  <TabsTrigger value="tasks" className="text-xs gap-1.5">
                    <ListTodo className="h-3.5 w-3.5" aria-hidden="true" />
                    Công việc ({release.tasks.length})
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="text-xs gap-1.5">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    Ghi chú & Changelog
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="tasks" className="mt-0">
                  <ReleaseTaskList tasks={release.tasks} jiraBaseUrl={jiraBaseUrl} canManage={canManage} />
                </TabsContent>

                <TabsContent value="notes" className="mt-0 space-y-3">
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Ghi chú nội bộ hoặc changelog phát hành..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      disabled={!canManage || notesMutation.isPending}
                      className="min-h-[100px] text-xs font-mono"
                    />
                    {canManage && (
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={handleSaveNotes}
                          disabled={notesMutation.isPending || notes === (release.notes || "")}
                          className="gap-1.5 text-xs"
                        >
                          {notesMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <Save className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Lưu ghi chú
                        </Button>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Publish confirmation dialog */}
      <ReleasePublishDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        releaseId={release.id}
        version={release.version}
        projectKey={release.projectKey}
        jiraVersionId={release.jiraVersionId}
        jiraBaseUrl={jiraBaseUrl}
        taskCount={release.taskCount}
        doneCount={release.doneCount}
        gitCompleteCount={release.gitCompleteCount}
        deliveryReadyCount={release.deliveryReadyCount}
        releaseDate={release.releaseDate}
        onSuccess={onRefresh}
      />
    </>
  );
}

function renderStatusBadge(release: ReleaseCardItem) {
  if (release.archived) {
    return (
      <Badge variant="outline" className="text-[11px] gap-1 border-muted-foreground/30 text-muted-foreground">
        <Archive className="h-3 w-3" aria-hidden="true" />
        Đã lưu trữ
      </Badge>
    );
  }

  if (release.status === "released" || release.readiness === "released") {
    return (
      <Badge variant="outline" className="text-[11px] gap-1 border-emerald-500/30 text-emerald-500 bg-emerald-500/10">
        <Rocket className="h-3 w-3" aria-hidden="true" />
        Đã phát hành
      </Badge>
    );
  }

  if (release.taskCount === 0) {
    return (
      <Badge variant="outline" className="text-[11px] gap-1 border-muted-foreground/30 text-muted-foreground bg-muted/10">
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
        Chưa có task
      </Badge>
    );
  }

  if (release.readiness === "ready") {
    return (
      <Badge variant="outline" className="text-[11px] gap-1 border-teal-500/30 text-teal-500 bg-teal-500/10">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        Sẵn sàng phát hành
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-[11px] gap-1 border-amber-500/30 text-amber-500 bg-amber-500/10">
      <Clock className="h-3 w-3" aria-hidden="true" />
      Đang thực hiện
    </Badge>
  );
}
