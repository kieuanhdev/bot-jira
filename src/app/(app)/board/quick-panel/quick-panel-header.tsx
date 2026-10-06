import { Bot, Check, Clock, Copy, ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface QuickPanelHeaderProps {
  jiraKey: string;
  status: string;
  priority?: string | null;
  points?: number | null;
  aiScore?: { points: number } | null;
  aiDecision?: { decision: string } | null;
  stale?: { stateAgeDays: number } | null;
  dotClass: string;
  jiraUrl: string | null;
  copied: boolean;
  onCopyKey: () => void;
  onClose: () => void;
}

export function QuickPanelHeader({
  jiraKey,
  status,
  priority,
  points,
  aiScore,
  aiDecision,
  stale,
  dotClass,
  jiraUrl,
  copied,
  onCopyKey,
  onClose,
}: QuickPanelHeaderProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dotClass)} aria-hidden />
      {jiraUrl ? (
        <a
          href={jiraUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
          title="Mở xem trên Jira"
        >
          <span>{jiraKey}</span>
          <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
        </a>
      ) : (
        <span className="font-mono text-sm font-semibold text-primary">{jiraKey}</span>
      )}
      <Badge variant="secondary" className="text-[11px]">
        {status}
      </Badge>
      {priority && (
        <Badge variant="outline" className="text-[11px]">
          {priority}
        </Badge>
      )}
      {points != null && (
        <Badge variant="outline" className="text-[11px]">
          {points}pt
        </Badge>
      )}
      {aiScore && (
        <Badge
          variant={aiDecision ? (aiDecision.decision === "rejected" ? "danger" : "success") : "info"}
          className="h-4 gap-1 px-1.5 text-[10px]"
          title={aiDecision ? `AI ${aiDecision.decision}` : "AI estimate (pending)"}
        >
          <Bot className="h-2.5 w-2.5" />
          {aiScore.points}pt
        </Badge>
      )}
      {stale && (
        <Badge variant="warning" className="h-4 gap-1 px-1.5 text-[10px]">
          <Clock className="h-2.5 w-2.5" /> {stale.stateAgeDays}d
        </Badge>
      )}
      <div className="ml-auto flex items-center gap-0.5">
        {jiraUrl && (
          <a
            href={jiraUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground inline-flex items-center"
            title="Mở xem trên Jira"
            aria-label="Mở xem trên Jira"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <button
          onClick={onCopyKey}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Copy key"
          title="Copy key"
        >
          {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
        </button>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close"
          title="Close (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
