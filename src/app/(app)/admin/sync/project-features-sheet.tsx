"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api-client";
import type { AdminProjectSyncRow } from "@/lib/admin/project-sync";
import {
  ALL_SYNC_FEATURES,
  PRESET_LABELS,
  SYNC_FEATURES,
  derivePreset,
  presetToFeatures,
  requiresBackfill,
  type SyncFeature,
  type SyncPreset,
} from "@/lib/jira/sync-features-shared";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SyncSwitch } from "./sync-switch";

const FEATURE_CATEGORIES: Array<{
  category: "jira" | "dev" | "automation";
  title: string;
}> = [
  { category: "jira", title: "Dữ liệu Jira" },
  { category: "dev", title: "Phát triển" },
  { category: "automation", title: "Tự động hoá & báo cáo" },
];

export interface ProjectFeaturesSheetProps {
  project: AdminProjectSyncRow | null;
  onClose: () => void;
  onSuccess: (feedbackText: string) => void;
  onError: (errorText: string) => void;
}

export function ProjectFeaturesSheet({
  project,
  onClose,
  onSuccess,
  onError,
}: ProjectFeaturesSheetProps) {
  const [customFeatures, setCustomFeatures] = useState<Record<SyncFeature, boolean> | null>(null);
  const [confirmingSave, setConfirmingSave] = useState(false);
  const [warningReasons, setWarningReasons] = useState<string[]>([]);

  // Derived features: use custom edited state if dirty, otherwise project.features
  const currentFeatures = useMemo(() => {
    if (!project) return null;
    return customFeatures ?? { ...project.features };
  }, [project, customFeatures]);

  const currentPreset = useMemo<SyncPreset>(() => {
    if (!currentFeatures) return "custom";
    return derivePreset(currentFeatures);
  }, [currentFeatures]);

  const hasChanges = useMemo(() => {
    if (!project || !currentFeatures) return false;
    return ALL_SYNC_FEATURES.some((f) => project.features[f] !== currentFeatures[f]);
  }, [project, currentFeatures]);

  const updateFeatures = useMutation({
    mutationFn: ({
      key,
      features,
    }: {
      key: string;
      features: Record<SyncFeature, boolean>;
    }) =>
      api<{
        key: string;
        features: Record<SyncFeature, boolean>;
        preset: SyncPreset;
        backfillJobId: string | null;
      }>(`/api/admin/projects/${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: { features },
      }),
    onSuccess: (res) => {
      setConfirmingSave(false);
      setCustomFeatures(null);
      const text = `Đã cập nhật cấu hình đồng bộ cho ${res.key}.${
        res.backfillJobId
          ? " Đã xếp hàng đồng bộ bù ngầm toàn bộ dữ liệu (thông báo watcher được tắt)."
          : ""
      }`;
      onSuccess(text);
      onClose();
    },
    onError: (e) => {
      onError(getErrorMessage(e));
    },
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setCustomFeatures(null);
      setConfirmingSave(false);
      onClose();
    }
  };

  const handleFeatureToggle = (feature: SyncFeature, next: boolean) => {
    setCustomFeatures((prev) => {
      const base = prev ?? (project ? { ...project.features } : ({} as Record<SyncFeature, boolean>));
      return { ...base, [feature]: next };
    });
  };

  const handleApplyPreset = (preset: Exclude<SyncPreset, "custom">) => {
    setCustomFeatures(presetToFeatures(preset));
  };

  const handleSaveClick = () => {
    if (!project || !currentFeatures) return;

    const reasons: string[] = [];
    if (requiresBackfill(project.features, currentFeatures)) {
      reasons.push(
        "Bật lại Bình luận hoặc Trường người dùng sẽ kích hoạt một lượt đồng bộ toàn bộ (full scan) ngầm để bù dữ liệu cũ. Thông báo watcher sẽ được tự động tắt trong lượt này."
      );
    }
    if (project.features.reportSnapshots && !currentFeatures.reportSnapshots) {
      reasons.push(
        "Tắt Snapshot báo cáo sẽ khiến các ngày bị bỏ lỡ không thể chụp bù lại sau này."
      );
    }

    if (reasons.length > 0) {
      setWarningReasons(reasons);
      setConfirmingSave(true);
    } else {
      updateFeatures.mutate({ key: project.key, features: currentFeatures });
    }
  };

  const handleConfirmSave = () => {
    if (project && currentFeatures) {
      updateFeatures.mutate({ key: project.key, features: currentFeatures });
    }
  };

  return (
    <>
      <Sheet
        open={project !== null}
        onOpenChange={handleOpenChange}
        title={project ? `Cấu hình đồng bộ — ${project.key}` : undefined}
        description={project?.name}
      >
        {project && currentFeatures && (
          <div className="flex flex-col gap-5 py-2">
            {!project.syncEnabled && (
              <div className="rounded-md border border-amber-300/50 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                <span className="font-semibold">Đồng bộ đang tắt:</span> Các hạng mục được cấu
                hình dưới đây sẽ có hiệu lực khi công tắc đồng bộ tổng của dự án được bật lại.
              </div>
            )}

            {/* Segmented Preset Control */}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Preset cấu hình
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {(["full", "issues_comments", "issues_only"] as const).map((presetKey) => {
                  const isSelected = currentPreset === presetKey;
                  return (
                    <Button
                      key={presetKey}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className="h-8 cursor-pointer text-xs"
                      onClick={() => handleApplyPreset(presetKey)}
                    >
                      {PRESET_LABELS[presetKey]}
                    </Button>
                  );
                })}
                <Button
                  type="button"
                  variant={currentPreset === "custom" ? "default" : "outline"}
                  size="sm"
                  disabled
                  className="h-8 text-xs opacity-75"
                >
                  Tuỳ chỉnh
                </Button>
              </div>
            </div>

            {/* Categorized Feature Switches */}
            {FEATURE_CATEGORIES.map(({ category, title }) => {
              const featuresInCategory = ALL_SYNC_FEATURES.filter(
                (f) => SYNC_FEATURES[f].category === category
              );
              if (featuresInCategory.length === 0) return null;

              return (
                <div key={category} className="flex flex-col gap-1 border-t border-border/40 pt-3">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {title}
                  </div>
                  <div className="divide-y divide-border/30">
                    {featuresInCategory.map((featureKey) => {
                      const def = SYNC_FEATURES[featureKey];
                      const isChecked = currentFeatures[featureKey];

                      return (
                        <div
                          key={featureKey}
                          className="flex items-center justify-between gap-3 py-2.5"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">
                              {def.label}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {def.description}
                            </span>
                          </div>
                          <SyncSwitch
                            checked={isChecked}
                            label={def.label}
                            onChange={(next) => handleFeatureToggle(featureKey, next)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Action buttons at footer of Sheet */}
            <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={() => handleOpenChange(false)}
              >
                Huỷ
              </Button>
              <Button
                type="button"
                size="sm"
                className="cursor-pointer gap-1.5"
                disabled={!hasChanges || updateFeatures.isPending}
                onClick={handleSaveClick}
              >
                {updateFeatures.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                )}
                Lưu thay đổi
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      {/* Confirmation dialog for feature updates requiring backfill or data loss */}
      <ConfirmDialog
        open={confirmingSave}
        onOpenChange={setConfirmingSave}
        title="Xác nhận thay đổi cấu hình đồng bộ"
        tone="default"
        icon={SlidersHorizontal}
        pending={updateFeatures.isPending}
        onConfirm={handleConfirmSave}
        confirmLabel="Tiếp tục lưu"
        description="Lưu ý các hệ quả sau khi cập nhật cấu hình cho dự án này:"
      >
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {warningReasons.map((reason, idx) => (
            <li key={idx}>{reason}</li>
          ))}
        </ul>
      </ConfirmDialog>
    </>
  );
}
