"use client";

import { useMemo, useRef, useState, type MouseEvent, type SyntheticEvent } from "react";
import { cn } from "@/lib/utils";
import { wikiToHtml } from "@/lib/wiki";
import { ImageLightbox, type LightboxImage } from "@/components/issues/image-lightbox";

/** What the attachment proxy answered, turned into something a user can act on. */
export function describeImageFailure(status: number, code: string | null): string {
  if (status === 401 && code === "unauthorized") return "Phiên đăng nhập đã hết hạn.";
  if (status === 401) return "Chưa có token Jira hợp lệ (vào Cài đặt để liên kết lại).";
  if (status === 429) return "Tải quá nhiều ảnh cùng lúc, thử lại sau ít phút.";
  if (code === "issue_unavailable") return "Không đọc được task này trên Jira bằng token hiện tại.";
  if (code === "attachment_not_found") return "Jira không có file đính kèm nào tên như vậy.";
  if (code === "attachment_fetch_failed") return "Jira từ chối hoặc không trả ảnh (kiểm tra quyền xem file đính kèm).";
  if (code === "attachment_too_large") return "Ảnh lớn hơn 10MB.";
  return `Lỗi ${status}${code ? ` (${code})` : ""}.`;
}

function placeholder(img: HTMLImageElement, reason: string) {
  const name = img.alt || "ảnh";
  const box = document.createElement("span");
  box.setAttribute("role", "note");
  box.className =
    "inline-flex max-w-full flex-col gap-0.5 rounded-md border border-dashed border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground";
  const title = document.createElement("span");
  title.className = "font-medium text-foreground";
  title.textContent = `Không tải được ảnh: ${name}`;
  const why = document.createElement("span");
  why.textContent = reason;
  box.append(title, why);
  // The image sits inside a link to itself; replace the whole link.
  (img.closest("a") ?? img).replaceWith(box);
}

/**
 * Renders Jira wiki markup. Images that fail to load are swapped for a note that
 * says why, so a broken attachment is never a silent blank.
 */
export function WikiContent({
  source,
  issueKey,
  className,
}: {
  source: string;
  issueKey: string;
  className?: string;
}) {
  const html = useMemo(() => wikiToHtml(source, { issueKey }), [source, issueKey]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<{ images: LightboxImage[]; index: number } | null>(null);

  // Open images in the in-page viewer, paging through every image in this block.
  function onClick(e: MouseEvent<HTMLDivElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // keep "open in new tab"
    const clicked = (e.target as HTMLElement).closest("img");
    if (!clicked || !containerRef.current) return;
    const all = Array.from(containerRef.current.querySelectorAll("img"));
    e.preventDefault();
    setViewer({
      images: all.map((img) => ({ src: img.currentSrc || img.src, alt: img.alt || "Ảnh", downloadHref: img.currentSrc || img.src })),
      index: Math.max(0, all.indexOf(clicked)),
    });
  }

  // `error` does not bubble, but React still sees it in the capture phase.
  function onImageError(e: SyntheticEvent<HTMLDivElement>) {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.failed) return;
    img.dataset.failed = "1";
    const src = img.getAttribute("src") ?? "";
    if (!src.startsWith("/api/")) return placeholder(img, "Không tải được từ địa chỉ này.");
    fetch(src)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        placeholder(img, describeImageFailure(res.status, body?.error ?? null));
      })
      .catch(() => placeholder(img, "Không kết nối được tới máy chủ."));
  }

  return (
    <>
      <div
        ref={containerRef}
        className={cn("wiki-content", className)}
        onErrorCapture={onImageError}
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {viewer && (
        <ImageLightbox
          images={viewer.images}
          index={viewer.index}
          onIndexChange={(index) => setViewer({ ...viewer, index })}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}
