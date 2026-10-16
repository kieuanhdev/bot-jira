"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface UseUrlStateOptions {
  /** If true, uses router.replace instead of router.push. Default: true. */
  replace?: boolean;
  /** If true, scrolls to top of page after navigation. Default: false. */
  scroll?: boolean;
}

/**
 * Hook for reading and safely synchronizing URL search parameters.
 * Guards against redundant navigation when query params have not changed.
 */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateUrl = useCallback(
    (
      updater: (params: URLSearchParams) => void,
      options?: UseUrlStateOptions
    ) => {
      const currentQuery = searchParams.toString();
      const nextParams = new URLSearchParams(currentQuery);
      updater(nextParams);
      const nextQuery = nextParams.toString();

      if (nextQuery === currentQuery) {
        return false;
      }

      const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      const scroll = options?.scroll ?? false;
      const replace = options?.replace ?? true;

      if (replace) {
        router.replace(nextUrl, { scroll });
      } else {
        router.push(nextUrl, { scroll });
      }

      return true;
    },
    [pathname, router, searchParams]
  );

  return {
    pathname,
    router,
    searchParams,
    updateUrl,
  };
}
