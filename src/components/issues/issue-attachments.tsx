"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, ImageOff, Paperclip } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { api, getErrorMessage } from "@/lib/api-client";
import { formatBytes } from "@/lib/format-bytes";
import { issuesKeys } from "@/lib/query-keys";
import { cn, formatDateTime } from "@/lib/utils";
import { ImageLightbox } from "@/components/issues/image-lightbox";
import type { AttachmentItem } from "@/lib/jira/attachment-route-service";

const fileUrl = (key: string, id: string, download = false) =>
  `/api/jira/attachment?key=${encodeURIComponent(key)}&id=${encodeURIComponent(id)}${download ? "&download=1" : ""}`;

function ImageTile({
  issueKey,
  item,
  onOpen,
}: {
  issueKey: string;
  item: AttachmentItem;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onOpen}
        disabled={failed}
        title={`Xem ${item.filename}`}
        className="group block w-full cursor-pointer overflow-hidden rounded-md border bg-muted/20 text-left transition-colors duration-150 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
      >
        <div className="flex min-h-24 items-center justify-center bg-muted/40 p-1">
          {failed ? (
            <span className="flex flex-col items-center gap-1 py-4 text-[11px] text-muted-foreground">
              <ImageOff className="h-5 w-5" aria-hidden="true" />
              Không tải được ảnh
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy, not optimizable
            <img
              src={fileUrl(issueKey, item.id)}
              alt={item.filename}
              loading="lazy"
              onError={() => setFailed(true)}
              className="h-auto max-h-72 w-auto max-w-full object-contain"
            />
          )}
        </div>
        <div className="px-2 py-1.5">
          <p className="truncate text-xs font-medium">{item.filename}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {formatBytes(item.size)}
            {item.created ? ` · ${formatDateTime(item.created)}` : ""}
          </p>
        </div>
      </button>
    </li>
  );
}

function FileRow({ issueKey, item }: { issueKey: string; item: AttachmentItem }) {
  return (
    <li>
      <a
        href={fileUrl(issueKey, item.id, true)}
        download={item.filename}
        title={`Tải ${item.filename}`}
        className="group flex cursor-pointer items-center gap-2.5 rounded-md border bg-muted/20 px-2.5 py-2 transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{item.filename}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {formatBytes(item.size)}
            {item.author ? ` · ${item.author}` : ""}
            {item.created ? ` · ${formatDateTime(item.created)}` : ""}
          </span>
        </span>
        <Download
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors duration-150 group-hover:text-primary"
          aria-hidden="true"
        />
      </a>
    </li>
  );
}

/** Jira-style Attachments panel: image thumbnails first, then the other files. */
export function IssueAttachments({ jiraKey, className }: { jiraKey: string; className?: string }) {
  const { data, isPending, error } = useQuery({
    queryKey: [...issuesKeys.detail(jiraKey), "attachments"] as const,
    queryFn: () => api<{ items: AttachmentItem[] }>(`/api/issues/${jiraKey}/attachments`),
    staleTime: 60_000,
    retry: 1,
  });

  const [viewer, setViewer] = useState<number | null>(null);

  const items = data?.items ?? [];
  const images = items.filter((i) => i.isImage);
  const files = items.filter((i) => !i.isImage);

  return (
    <section className={cn(className)} aria-labelledby={`attachments-${jiraKey}`}>
      <div className="mb-2 flex items-center gap-1.5">
        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <h3
          id={`attachments-${jiraKey}`}
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Tệp đính kèm{items.length > 0 ? ` (${items.length})` : ""}
        </h3>
      </div>

      {isPending ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
          {getErrorMessage(error, "Không đọc được tệp đính kèm từ Jira.")}
        </p>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-md border border-dashed bg-muted/20 p-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
            <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium">Chưa có tệp đính kèm</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Ảnh và file đính kèm trên Jira sẽ hiện ở đây.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {images.length > 0 && (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {images.map((item, i) => (
                <ImageTile key={item.id} issueKey={jiraKey} item={item} onOpen={() => setViewer(i)} />
              ))}
            </ul>
          )}
          {files.length > 0 && (
            <ul className="space-y-1.5">
              {files.map((item) => (
                <FileRow key={item.id} issueKey={jiraKey} item={item} />
              ))}
            </ul>
          )}
        </div>
      )}

      {viewer !== null && (
        <ImageLightbox
          images={images.map((i) => ({
            src: fileUrl(jiraKey, i.id),
            alt: i.filename,
            downloadHref: fileUrl(jiraKey, i.id, true),
          }))}
          index={viewer}
          onIndexChange={setViewer}
          onClose={() => setViewer(null)}
        />
      )}
    </section>
  );
}
