import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";
import { wikiToHtml } from "@/lib/wiki";
import type { IssueDetail } from "./lib/issue-detail-types";

interface IssueDetailTabsCommentsProps {
  comments: IssueDetail["comments"];
  commentDraft: string;
  onCommentDraftChange: (value: string) => void;
  commenting: boolean;
  onAddComment: () => void;
}

export function IssueDetailTabsComments({
  comments,
  commentDraft,
  onCommentDraftChange,
  commenting,
  onAddComment,
}: IssueDetailTabsCommentsProps) {
  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="p-4">
          <Textarea
            value={commentDraft}
            onChange={(e) => onCommentDraftChange(e.target.value)}
            placeholder="Thêm bình luận lên Jira…"
            rows={3}
            className="resize-y"
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              disabled={commenting || !commentDraft.trim()}
              onClick={onAddComment}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {commenting ? "Đang gửi…" : "Bình luận"}
            </Button>
          </div>
        </CardContent>
      </Card>
      {comments.length === 0 && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">Chưa có bình luận nào.</CardContent>
        </Card>
      )}
      {comments.map((c) => (
        <Card key={c.id}>
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2 text-sm">
              <span className="font-medium">{c.author}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</span>
            </div>
            <div
              className="wiki-content text-sm"
              dangerouslySetInnerHTML={{ __html: wikiToHtml(c.body) }}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
