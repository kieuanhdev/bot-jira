"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { FeedbackBanner } from "@/components/shared/feedback-banner";

export type SystemStatusIssue = {
  text: string;
  sectionId?: string;
  href?: string;
};

export type SystemStatusData = {
  tone: "destructive" | "warning" | "success";
  issues: SystemStatusIssue[];
  summaryOk: string;
};

export interface SystemStatusBannerProps {
  status: SystemStatusData | null;
  onScrollToSection: (id: string) => void;
}

export function SystemStatusBanner({ status, onScrollToSection }: SystemStatusBannerProps) {
  if (!status) return null;

  return (
    <FeedbackBanner
      tone={status.tone}
      icon={
        status.tone === "destructive"
          ? XCircle
          : status.tone === "warning"
          ? AlertTriangle
          : CheckCircle2
      }
      role={status.tone === "success" ? "status" : "alert"}
    >
      {status.tone === "success" ? (
        <span className="font-medium">{status.summaryOk}</span>
      ) : (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          <span className="font-semibold">{status.issues.length} vấn đề cần lưu ý:</span>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {status.issues.slice(0, 4).map((issue, idx) => (
              <span key={idx} className="inline-flex items-center gap-1">
                {idx > 0 && <span aria-hidden="true">·</span>}
                {issue.sectionId ? (
                  <button
                    type="button"
                    onClick={() => onScrollToSection(issue.sectionId!)}
                    className="cursor-pointer font-medium underline-offset-2 hover:underline"
                  >
                    {issue.text}
                  </button>
                ) : issue.href ? (
                  <Link
                    href={issue.href}
                    className="cursor-pointer font-medium underline-offset-2 hover:underline"
                  >
                    {issue.text}
                  </Link>
                ) : (
                  <span>{issue.text}</span>
                )}
              </span>
            ))}
            {status.issues.length > 4 && (
              <span className="text-muted-foreground">+{status.issues.length - 4} vấn đề khác</span>
            )}
          </div>
        </div>
      )}
    </FeedbackBanner>
  );
}
