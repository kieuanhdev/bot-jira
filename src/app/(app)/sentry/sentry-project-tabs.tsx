"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListFilter, Plus, RefreshCw } from "lucide-react";
import { api } from "@/lib/api-client";
import { meKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

const tabCls = (active: boolean) =>
  "flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
  (active
    ? "bg-primary text-primary-foreground"
    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground");

export interface SentryProjectTabsProps {
  selectedProject: string; // "" means "Tất cả"
  onSelectProject: (projectKey: string) => void;
  isAdmin?: boolean;
}

export function SentryProjectTabs({
  selectedProject,
  onSelectProject,
}: SentryProjectTabsProps) {
  const qc = useQueryClient();

  const { data: prefs } = useQuery({
    queryKey: meKeys.prefs,
    queryFn: () => api<{ projects: string[]; available: string[] }>("/api/me/preferences"),
  });

  const preferred = useMemo(() => prefs?.projects ?? [], [prefs?.projects]);
  const availableKeys = useMemo(() => prefs?.available ?? [], [prefs?.available]);

  const effectiveProjects = useMemo(
    () => (preferred.length === 0 ? availableKeys : preferred),
    [preferred, availableKeys]
  );

  const [showPicker, setShowPicker] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<string[] | null>(null);
  const [newKey, setNewKey] = useState("");
  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);

  const pickerActive = pickerSelection ?? effectiveProjects;
  const pickerSet = new Set(pickerActive);

  const openPicker = () => {
    setPickerSelection(effectiveProjects);
    setValidateError(null);
    setShowPicker(true);
  };

  const closePicker = () => {
    setShowPicker(false);
    setPickerSelection(null);
    setValidateError(null);
  };

  const savePrefs = async (next: string[]) => {
    await api("/api/me/preferences", { method: "PUT", body: { projects: next } });
    await qc.invalidateQueries({ queryKey: meKeys.prefs });
  };

  const toggleKey = (key: string) => {
    const next = new Set(pickerSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPickerSelection(Array.from(next));
  };

  const selectAll = () => {
    setPickerSelection([...availableKeys]);
  };

  const commitPicker = async () => {
    if (pickerSelection) {
      await savePrefs(pickerSelection);
    }
    closePicker();
  };

  const addProject = async () => {
    const k = newKey.trim().toUpperCase();
    if (!k) return;
    setValidating(true);
    setValidateError(null);
    try {
      const res = await api<{ exists: boolean; key: string }>(`/api/projects/validate?key=${encodeURIComponent(k)}`);
      if (res.exists) {
        const next = Array.from(new Set([...(pickerSelection ?? effectiveProjects), res.key]));
        setPickerSelection(next);
        setNewKey("");
      } else {
        setValidateError(`Không tìm thấy dự án Jira "${k}".`);
      }
    } catch {
      setValidateError("Không thể xác thực dự án Jira.");
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onSelectProject("")}
        className={tabCls(!selectedProject)}
      >
        Tất cả
      </button>

      {effectiveProjects.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelectProject(key)}
          className={tabCls(selectedProject === key)}
        >
          {key}
        </button>
      ))}

      <div className="relative">
        <button
          type="button"
          onClick={() => (showPicker ? closePicker() : openPicker())}
          className={
            "flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
            (preferred.length > 0
              ? "border border-primary/40 bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground")
          }
        >
          <ListFilter className="h-4 w-4" />
          {preferred.length > 0 ? `${preferred.length} đã chọn` : "Chọn dự án"}
        </button>

        {showPicker && (
          <Card className="absolute left-0 top-full z-20 mt-1 w-72 p-3 shadow-lg">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              Hiển thị dự án
            </p>
            <div className="flex max-h-56 flex-col gap-1 overflow-auto">
              {availableKeys.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={pickerSet.has(key)}
                    onCheckedChange={() => toggleKey(key)}
                  />
                  <span className="flex-1 font-medium">{key}</span>
                </label>
              ))}
            </div>

            <div className="mt-2.5 border-t border-border pt-2.5">
              <p className="mb-1 text-2xs font-semibold text-muted-foreground">
                Nhập dự án muốn có
              </p>
              <div className="flex gap-1.5">
                <Input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Mã dự án (VD: ABC)"
                  className="h-8 font-mono text-xs uppercase"
                  disabled={validating}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addProject();
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={validating || !newKey.trim()}
                  onClick={() => void addProject()}
                  className="h-8 shrink-0 cursor-pointer px-2.5 text-xs gap-1"
                >
                  {validating ? (
                    <RefreshCw className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  Thêm
                </Button>
              </div>
              {validateError && (
                <p className="mt-1 text-2xs font-medium text-destructive">{validateError}</p>
              )}
            </div>

            <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2">
              <button
                type="button"
                onClick={selectAll}
                className="cursor-pointer text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Chọn tất cả
              </button>
              <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => void commitPicker()}>
                Xong
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
