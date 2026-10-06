import { useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  Info,
  Pencil,
  RefreshCw,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { IssueDetail } from "./lib/issue-detail-types";

interface IssueDetailTabsAiProps {
  aiScore: IssueDetail["aiScore"];
  aiDecision: IssueDetail["aiDecision"];
  busy: boolean;
  onAiScore: () => void;
  onAiDecision: (decision: "accepted" | "edited" | "rejected", points?: number) => void;
  currentPoints?: number | null;
}

export function IssueDetailTabsAi({
  aiScore,
  aiDecision,
  busy,
  onAiScore,
  onAiDecision,
  currentPoints,
}: IssueDetailTabsAiProps) {
  const [editMode, setEditMode] = useState(false);
  const [editPoints, setEditPoints] = useState("");

  const startEdit = () => {
    if (!aiScore) return;
    setEditPoints(String(currentPoints ?? aiScore.points ?? ""));
    setEditMode(true);
  };

  const handleDecision = (decision: "accepted" | "edited" | "rejected", points?: number) => {
    onAiDecision(decision, points);
    if (decision !== "rejected") {
      setEditMode(false);
      setEditPoints("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-4 w-4" /> Chấm điểm task bằng AI
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!aiScore ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Chưa có điểm AI.</p>
            <Button onClick={onAiScore} disabled={busy}>
              <Bot className="h-4 w-4" /> Chấm điểm task này
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-lg bg-primary/10 px-4 py-2 text-2xl font-bold text-primary">
                {aiScore.points} điểm
              </div>
              {aiScore.confidence != null && (
                <Badge variant={aiScore.confidence >= 0.7 ? "success" : aiScore.confidence >= 0.4 ? "warning" : "danger"}>
                  {(aiScore.confidence * 100).toFixed(0)}% độ tin cậy
                </Badge>
              )}
              <div className="text-xs text-muted-foreground">{aiScore.model}</div>
            </div>
            <p className="text-sm">{aiScore.reasoning}</p>

            {aiScore.missingInformation?.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> Thông tin còn thiếu
                </p>
                <ul className="list-inside list-disc text-sm">
                  {aiScore.missingInformation.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {aiScore.risks?.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Rủi ro tiềm ẩn</p>
                <ul className="list-inside list-disc text-sm">
                  {aiScore.risks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {aiScore.similarTasks?.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Các task tương tự:</span>
                {aiScore.similarTasks.map((k, i) => (
                  <Badge key={i} variant="outline">
                    {k}
                  </Badge>
                ))}
              </div>
            )}

            {aiDecision && (
              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                <Info className="h-4 w-4 text-muted-foreground" />
                {aiDecision.decision === "accepted" && "Đã chấp nhận ước tính điểm AI."}
                {aiDecision.decision === "edited" && `Đã chỉnh sửa thành ${aiDecision.finalPoints} điểm và áp dụng.`}
                {aiDecision.decision === "rejected" && "Đã từ chối ước tính AI (Jira không thay đổi)."}
              </div>
            )}

            {editMode ? (
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm text-muted-foreground">Điểm</label>
                <Input
                  type="number"
                  min={1}
                  value={editPoints}
                  onChange={(e) => setEditPoints(e.target.value)}
                  className="w-24"
                />
                <Button size="sm" disabled={busy} onClick={() => handleDecision("edited", Number(editPoints))}>
                  <Check className="h-4 w-4" /> Áp dụng {editPoints || "?"} điểm → Jira
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditMode(false)}>
                  Huỷ
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button onClick={onAiScore} disabled={busy}>
                  <RefreshCw className="h-4 w-4" /> Chấm điểm lại
                </Button>
                <Button variant="outline" onClick={() => handleDecision("accepted")} disabled={busy}>
                  <Check className="h-4 w-4" /> Chấp nhận {aiScore.points} điểm → Jira
                </Button>
                <Button variant="outline" onClick={startEdit} disabled={busy}>
                  <Pencil className="h-4 w-4" /> Sửa điểm
                </Button>
                <Button variant="outline" onClick={() => handleDecision("rejected")} disabled={busy}>
                  <X className="h-4 w-4" /> Từ chối
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
