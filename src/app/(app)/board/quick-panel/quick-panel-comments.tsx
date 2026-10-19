import { useRef, useState, type ReactNode } from "react";
import { Pencil, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WikiContent } from "@/components/issues/wiki-content";
import { formatDateTime } from "@/lib/utils";

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

interface CommentItem {
  id: string;
  author: string;
  body: string;
  createdAt: string | null;
}

interface QuickPanelCommentsProps {
  jiraKey: string;
  description?: string | null;
  onSaveDescription: (description: string) => void;
  /** Rendered between the description and the comments (the Attachments panel). */
  afterDescription?: ReactNode;
  comments?: CommentItem[];
  onAddComment: (body: string) => Promise<void>;
  commentsDisabled?: boolean;
}

export function QuickPanelComments({
  jiraKey,
  description,
  onSaveDescription,
  afterDescription,
  comments = [],
  onAddComment,
  commentsDisabled = false,
}: QuickPanelCommentsProps) {
  const [commentDraft, setCommentDraft] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [descDraft, setDescDraft] = useState<string | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  const closeDescription = (save: boolean) => {
    if (descDraft === null) return;
    if (save && descDraft !== (description ?? "")) onSaveDescription(descDraft);
    setDescDraft(null);
    // Keep focus inside the panel so its focus trap and Escape keep working.
    requestAnimationFrame(() => editButtonRef.current?.focus());
  };

  const handleSend = async () => {
    const text = commentDraft.trim();
    if (!text || commenting) return;
    setCommenting(true);
    try {
      await onAddComment(text);
      setCommentDraft("");
    } finally {
      setCommenting(false);
    }
  };

  const commentCount = comments.length;

  return (
    <>
      <Section
        title="Description"
        action={
          descDraft === null && (
            <button
              ref={editButtonRef}
              type="button"
              onClick={() => setDescDraft(description ?? "")}
              className="flex cursor-pointer items-center gap-1 text-xs font-medium text-primary transition-colors duration-150 hover:underline"
            >
              <Pencil className="h-3 w-3" aria-hidden /> Sửa
            </button>
          )
        }
      >
        {descDraft !== null ? (
          <div className="flex flex-col gap-2">
            <textarea
              autoFocus
              data-escape-local
              aria-label="Description"
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") closeDescription(true);
                if (e.key === "Escape") closeDescription(false);
              }}
              rows={10}
              className="min-h-[10rem] w-full resize-y rounded-md border bg-background px-2.5 py-1.5 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Cú pháp Jira wiki · Ctrl+Enter để lưu</span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" className="h-8 cursor-pointer px-3 text-xs" onClick={() => closeDescription(false)}>
                  Hủy
                </Button>
                <Button size="sm" className="h-8 cursor-pointer px-3 text-xs" onClick={() => closeDescription(true)}>
                  Lưu
                </Button>
              </div>
            </div>
          </div>
        ) : description ? (
          <WikiContent source={description} issueKey={jiraKey} className="text-sm leading-relaxed" />
        ) : (
          <p className="text-sm italic text-muted-foreground">No description.</p>
        )}
      </Section>

      {afterDescription}

      <Section title={`Comments (${commentCount})`}>
        {commentsDisabled && (
          <div className="mb-2 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
            Bình luận không được đồng bộ cho dự án này.
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void handleSend();
            }}
            placeholder="Thêm bình luận lên Jira…"
            rows={2}
            className="min-h-[3rem] flex-1 resize-y rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={commenting || !commentDraft.trim()}
            onClick={() => void handleSend()}
            className="h-8 shrink-0 gap-1.5"
          >
            <Send className="h-3.5 w-3.5" /> {commenting ? "…" : "Gửi"}
          </Button>
        </div>
        {comments.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {comments
              .slice(-3)
              .map((c) => (
                <div key={c.id} className="rounded-md border bg-muted/30 p-2.5">
                  <div className="mb-1 flex items-center gap-2 text-xs">
                    <span className="font-medium">{c.author}</span>
                    <span className="text-muted-foreground">{formatDateTime(c.createdAt)}</span>
                  </div>
                  <WikiContent source={c.body} issueKey={jiraKey} className="text-sm" />
                </div>
              ))}
          </div>
        )}
      </Section>
    </>
  );
}
