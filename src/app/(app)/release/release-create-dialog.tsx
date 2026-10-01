"use client";

import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FeedbackBanner } from "@/components/shared/feedback-banner";

type ReleaseCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: string;
  onProjectChange: (project: string) => void;
  projectList: string[];
  selectedProject: string;
  version: string;
  onVersionChange: (version: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  error: string | null;
  pending: boolean;
  onSubmit: (e: React.FormEvent) => void;
};

export function ReleaseCreateDialog({
  open,
  onOpenChange,
  project,
  onProjectChange,
  projectList,
  selectedProject,
  version,
  onVersionChange,
  description,
  onDescriptionChange,
  error,
  pending,
  onSubmit,
}: ReleaseCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Plus className="h-5 w-5 text-teal-500" aria-hidden="true" />
              Tạo bản phát hành mới
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Tạo Fix Version trên Jira và liên kết các task thuộc phiên bản này.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="create-project" className="text-xs font-semibold">
                Dự án Jira <span className="text-destructive">*</span>
              </Label>
              <Select value={project} onValueChange={onProjectChange} disabled>
                <SelectTrigger id="create-project" className="text-xs bg-muted/50 cursor-not-allowed">
                  <SelectValue placeholder="Chọn dự án" />
                </SelectTrigger>
                <SelectContent>
                  {projectList.map((key) => (
                    <SelectItem key={key} value={key} className="text-xs">
                      {key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Được khóa theo dự án đang chọn ({selectedProject}).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-version" className="text-xs font-semibold">
                Tên phiên bản (Fix Version) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-version"
                placeholder="Ví dụ: v1.0.0 hoặc Release-2026-10"
                value={version}
                onChange={(e) => onVersionChange(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-desc" className="text-xs font-semibold">
                Mô tả (tùy chọn)
              </Label>
              <Input
                id="create-desc"
                placeholder="Mục tiêu hoặc nội dung chính của đợt phát hành"
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                className="text-xs"
              />
            </div>

            {error && (
              <FeedbackBanner tone="destructive" className="text-xs">
                {error}
              </FeedbackBanner>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Đang tạo...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Tạo phiên bản
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
