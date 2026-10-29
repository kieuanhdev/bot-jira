import Link from "next/link";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { USER_GUIDE_ASSET_PATH, USER_GUIDE_BASE_PATH } from "@/lib/user-guides";

/**
 * Maps the relative URLs written for the standalone Markdown folder
 * (`images/…`, `videos/…`, `huong-dan-x.md`) onto the in-app locations.
 */
function resolveGuideUrl(url: string): string {
  if (/^(images|videos)\//.test(url)) return `${USER_GUIDE_ASSET_PATH}/${url}`;
  const guideLink = url.match(/^(huong-dan-[a-z0-9-]+)\.md(#.*)?$/);
  if (guideLink) return `${USER_GUIDE_BASE_PATH}/${guideLink[1]}${guideLink[2] ?? ""}`;
  return url;
}

const components: Components = {
  h1: ({ children }) => <h1 className="text-2xl font-bold tracking-tight text-foreground">{children}</h1>,
  h2: ({ children }) => (
    <h2 className="mt-10 border-b border-border pb-2 text-xl font-semibold tracking-tight text-foreground">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mt-6 text-base font-semibold text-foreground">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-4 text-sm font-semibold text-foreground">{children}</h4>,
  p: ({ children }) => <p className="mt-3 text-sm leading-relaxed text-foreground">{children}</p>,
  ul: ({ children }) => <ul className="mt-3 list-disc space-y-1.5 pl-6 text-sm text-foreground marker:text-muted-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1.5 pl-6 text-sm text-foreground marker:text-muted-foreground">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed [&>p]:mt-1 [&>ul]:mt-1.5 [&>ol]:mt-1.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  hr: () => <hr className="my-8 border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="mt-4 rounded-r-lg border-l-4 border-primary bg-primary-soft/60 px-4 py-2 text-foreground [&>p:first-child]:mt-0 [&>p]:mt-1.5">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-muted p-4 font-mono text-xs leading-relaxed text-foreground">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mt-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
  th: ({ children }) => <th className="border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">{children}</th>,
  td: ({ children }) => <td className="border-b border-border px-3 py-2 align-top text-foreground [tr:last-child>&]:border-b-0">{children}</td>,
  img: ({ src, alt }) => {
    const url = typeof src === "string" ? resolveGuideUrl(src) : "";
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 block cursor-zoom-in">
        {/* eslint-disable-next-line @next/next/no-img-element -- static screenshots of mixed sizes, shown at natural ratio */}
        <img
          src={url}
          alt={alt ?? ""}
          loading="lazy"
          decoding="async"
          className="h-auto max-w-full rounded-lg border border-border shadow-sm"
        />
        {alt ? <span className="mt-1.5 block text-center text-xs text-muted-foreground">{alt}</span> : null}
      </a>
    );
  },
  a: ({ href, children }) => {
    const url = href ? resolveGuideUrl(href) : "";
    const linkClass = "font-medium text-primary underline underline-offset-2 transition-colors duration-150 hover:text-primary/80";

    if (url.endsWith(".webm") || url.endsWith(".mp4")) {
      return (
        <span className="mt-3 block">
          <a href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {children}
          </a>
          <video controls preload="metadata" className="mt-2 block w-full max-w-3xl rounded-lg border border-border bg-muted">
            <source src={url} type={url.endsWith(".webm") ? "video/webm" : "video/mp4"} />
          </video>
        </span>
      );
    }
    if (url.startsWith("/")) {
      return (
        <Link href={url} className={linkClass}>
          {children}
        </Link>
      );
    }
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {children}
      </a>
    );
  },
};

export function UserGuideMarkdown({ source }: { source: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={components}>
      {source}
    </Markdown>
  );
}
