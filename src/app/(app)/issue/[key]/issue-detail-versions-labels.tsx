import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface IssueDetailVersionsLabelsProps {
  fixVersions: string[];
  projectVersions: { id: string; name: string }[];
  onAddVersion: (version: string) => void;
  onRemoveVersion: (version: string) => void;
  labels: string[];
  onAddLabel: (label: string) => void;
  onRemoveLabel: (label: string) => void;
}

export function IssueDetailVersionsLabels({
  fixVersions,
  projectVersions,
  onAddVersion,
  onRemoveVersion,
  labels,
  onAddLabel,
  onRemoveLabel,
}: IssueDetailVersionsLabelsProps) {
  const [showAddVersion, setShowAddVersion] = useState(false);
  const [newVersionInput, setNewVersionInput] = useState("");
  const [showAddLabel, setShowAddLabel] = useState(false);
  const [newLabelInput, setNewLabelInput] = useState("");

  const handleSaveVersion = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    onAddVersion(trimmed);
    setNewVersionInput("");
    setShowAddVersion(false);
  };

  const handleSaveLabel = () => {
    const trimmed = newLabelInput.trim();
    if (!trimmed) return;
    onAddLabel(trimmed);
    setNewLabelInput("");
    setShowAddLabel(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-6 rounded-lg border bg-muted/20 px-3 py-2 text-xs">
      {/* Fix Versions */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-semibold text-muted-foreground">Fix Version:</span>
        {fixVersions.length === 0 && !showAddVersion && (
          <span className="italic text-muted-foreground">Chưa có</span>
        )}
        {fixVersions.map((v) => (
          <Badge key={v} variant="info" className="gap-1 text-[11px]">
            {v}
            <button
              onClick={() => onRemoveVersion(v)}
              className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
              title={`Gỡ ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {showAddVersion ? (
          <div className="flex items-center gap-1">
            {projectVersions.length > 0 ? (
              <Select onValueChange={(val) => handleSaveVersion(val)}>
                <SelectTrigger className="h-6 w-32 text-xs">
                  <SelectValue placeholder="Chọn version…" />
                </SelectTrigger>
                <SelectContent>
                  {projectVersions.map((pv) => (
                    <SelectItem key={pv.id} value={pv.name} className="text-xs">
                      {pv.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                autoFocus
                value={newVersionInput}
                onChange={(e) => setNewVersionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveVersion(newVersionInput);
                  if (e.key === "Escape") setShowAddVersion(false);
                }}
                placeholder="1.0.0"
                className="h-6 w-24 text-xs px-1.5"
              />
            )}
            {!projectVersions.length && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                onClick={() => handleSaveVersion(newVersionInput)}
              >
                Lưu
              </Button>
            )}
            <button
              onClick={() => setShowAddVersion(false)}
              className="p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddVersion(true)}
            className="flex items-center gap-0.5 text-primary hover:underline font-medium"
          >
            <Plus className="h-3 w-3" /> Thêm version
          </button>
        )}
      </div>

      {/* Labels */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-semibold text-muted-foreground">Nhãn:</span>
        {labels.length === 0 && !showAddLabel && (
          <span className="italic text-muted-foreground">Không có</span>
        )}
        {labels.map((l) => (
          <Badge key={l} variant="outline" className="gap-1 text-[11px]">
            {l}
            <button
              onClick={() => onRemoveLabel(l)}
              className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
              title={`Xóa nhãn ${l}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {showAddLabel ? (
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              value={newLabelInput}
              onChange={(e) => setNewLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveLabel();
                if (e.key === "Escape") setShowAddLabel(false);
              }}
              placeholder="Tên nhãn…"
              className="h-6 w-24 text-xs px-1.5"
            />
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={handleSaveLabel}>
              Lưu
            </Button>
            <button
              onClick={() => setShowAddLabel(false)}
              className="p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddLabel(true)}
            className="flex items-center gap-0.5 text-primary hover:underline font-medium"
          >
            <Plus className="h-3 w-3" /> Thêm nhãn
          </button>
        )}
      </div>
    </div>
  );
}
