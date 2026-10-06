import { useState, type ReactNode } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { wikiToHtml } from "@/lib/wiki";
import { formatDateTime } from "@/lib/utils";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
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
  description?: string | null;
  comments?: CommentItem[];
  onAddComment: (body: string) => Promise<void>;
}

export function QuickPanelComments({
  description,
  comments = [],
  onAddComment,
}: QuickPanelCommentsProps) {
  const [commentDraft, setCommentDraft] = useState("");
  const [commenting, setCommenting] = useState(false);

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
      <Section title="Description">
        {description ? (
          <div
            className="wiki-content text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: wikiToHtml(description) }}
          />
        ) : (
          <p className="text-sm italic text-muted-foreground">No description.</p>
        )}
      </Section>

      <Section title={`Comments (${commentCount})`}>
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
                  <div
                    className="wiki-content text-sm"
                    dangerouslySetInnerHTML={{ __html: wikiToHtml(c.body) }}
                  />
                </div>
              ))}
          </div>
        )}
      </Section>
    </>
  );
}
