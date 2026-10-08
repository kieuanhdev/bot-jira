"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { avatarClass, initials } from "@/lib/avatar";

export interface JiraAvatarProps {
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  title?: string | null;
  badge?: string | null;
}

const SIZE_MAP = {
  xs: "h-4 w-4 text-[8px]",
  sm: "h-5 w-5 text-[10px]",
  md: "h-6 w-6 text-xs",
  lg: "h-8 w-8 text-sm",
  xl: "h-12 w-12 text-base",
};

const JIRA_SIZE_MAP = {
  xs: "xsmall",
  sm: "small",
  md: "small",
  lg: "medium",
  xl: "large",
};

export function JiraAvatar({
  username,
  displayName,
  avatarUrl,
  className,
  fallbackClassName,
  size = "sm",
  title,
  badge,
}: JiraAvatarProps) {
  const [loadError, setLoadError] = useState(false);

  const identifier = username || displayName || "";
  const effectiveTitle = title ?? (displayName || username || "User");
  const sizeClasses = SIZE_MAP[size] || SIZE_MAP.sm;

  if (!identifier && !avatarUrl) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border border-dashed border-border font-medium text-muted-foreground/60 select-none",
          sizeClasses,
          className
        )}
        title={effectiveTitle}
        aria-label={effectiveTitle}
      >
        –
      </span>
    );
  }

  const jiraSize = JIRA_SIZE_MAP[size] || "small";
  const imageSrc = avatarUrl
    ? `/api/jira/avatar?url=${encodeURIComponent(avatarUrl)}`
    : username
      ? `/api/jira/avatar?username=${encodeURIComponent(username)}&size=${jiraSize}`
      : null;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none overflow-hidden rounded-full items-center justify-center",
        sizeClasses,
        className
      )}
      title={effectiveTitle}
      aria-label={effectiveTitle}
    >
      {imageSrc && !loadError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt={displayName || username || ""}
          className="h-full w-full rounded-full object-cover"
          onError={() => setLoadError(true)}
        />
      ) : (
        <span
          className={cn(
            "flex h-full w-full items-center justify-center rounded-full font-semibold",
            avatarClass(identifier),
            fallbackClassName
          )}
        >
          {badge ? badge : initials(displayName || username)}
        </span>
      )}
    </span>
  );
}
