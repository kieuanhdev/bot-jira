import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { UserGuideMarkdown } from "@/components/docs/user-guide-markdown";
import { USER_GUIDES, USER_GUIDE_BASE_PATH, findUserGuide, readUserGuide } from "@/lib/user-guides";

export const dynamicParams = false;

export function generateStaticParams() {
  return USER_GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = findUserGuide(slug);
  return {
    title: guide ? `Hướng dẫn: ${guide.title} — Team Task Web` : "Hướng dẫn sử dụng — Team Task Web",
    description: guide?.description,
  };
}

export default async function UserGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const source = await readUserGuide(slug);
  if (source === null) notFound();

  const index = USER_GUIDES.findIndex((guide) => guide.slug === slug);
  const prev = USER_GUIDES[index - 1];
  const next = USER_GUIDES[index + 1];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/docs"
        className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Tài liệu &amp; Hướng dẫn
      </Link>

      <Card className="px-5 py-6 sm:px-8 sm:py-8">
        <article className="mx-auto max-w-4xl">
          <UserGuideMarkdown source={source} />
        </article>
      </Card>

      <nav aria-label="Chuyển tài liệu" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {prev ? (
          <Link
            href={`${USER_GUIDE_BASE_PATH}/${prev.slug}`}
            className="flex cursor-pointer flex-col gap-1 rounded-xl border border-border bg-card p-4 transition-colors duration-150 hover:border-primary/60 hover:bg-accent"
          >
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Phần trước
            </span>
            <span className="text-sm font-semibold text-foreground">{prev.title}</span>
          </Link>
        ) : (
          <span className="hidden sm:block" />
        )}
        {next ? (
          <Link
            href={`${USER_GUIDE_BASE_PATH}/${next.slug}`}
            className="flex cursor-pointer flex-col items-end gap-1 rounded-xl border border-border bg-card p-4 text-right transition-colors duration-150 hover:border-primary/60 hover:bg-accent"
          >
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              Phần tiếp
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold text-foreground">{next.title}</span>
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
