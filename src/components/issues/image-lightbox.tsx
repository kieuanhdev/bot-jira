"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";

export type LightboxImage = {
  src: string;
  alt: string;
  /** Link that saves the original file; omitted when the source cannot be downloaded. */
  downloadHref?: string;
};

/**
 * Full-screen image viewer that stays on the page. Rendered through a portal, and
 * Escape / arrow keys are handled in the capture phase so a host dialog (the quick
 * panel closes on Escape) never sees them.
 */
export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: LightboxImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const count = images.length;
  const current = images[index];

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (count > 1 && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        e.stopPropagation();
        onIndexChange((index + (e.key === "ArrowRight" ? 1 : -1) + count) % count);
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Hand focus back so the host dialog's own Escape/Tab handling keeps working.
      previouslyFocused?.focus?.();
    };
  }, [count, index, onClose, onIndexChange]);

  if (!current || typeof document === "undefined") return null;

  const navButton =
    "absolute top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white transition-colors duration-150 hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

  return createPortal(
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      data-image-lightbox
      aria-label={current.alt}
      className="pointer-events-auto fixed inset-0 z-[60] flex flex-col bg-black/85 outline-none motion-safe:animate-in motion-safe:fade-in"
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3 text-white">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {current.alt}
          {count > 1 && <span className="ml-2 text-xs text-white/70">{index + 1} / {count}</span>}
        </p>
        {current.downloadHref && (
          <a
            href={current.downloadHref}
            download={current.alt}
            title="Tải xuống"
            aria-label="Tải xuống"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          title="Đóng (Esc)"
          aria-label="Đóng"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated proxy, not optimizable */}
        <img
          key={current.src}
          src={current.src}
          alt={current.alt}
          className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
        />
        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Ảnh trước"
              onClick={() => onIndexChange((index - 1 + count) % count)}
              className={`${navButton} left-3`}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Ảnh sau"
              onClick={() => onIndexChange((index + 1) % count)}
              className={`${navButton} right-3`}
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
