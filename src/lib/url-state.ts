/**
 * Update the address bar without a Next.js navigation.
 *
 * Filters live in the URL so they survive reload and sharing, but the data for
 * them comes from client queries. `router.replace`/`router.push` would also
 * request the page's RSC payload and re-run its server prefetch on every
 * change. Next.js syncs `useSearchParams`/`usePathname` with the native History
 * API, so these calls update client state without that round trip.
 */
export function replaceUrlState(url: string): void {
  window.history.replaceState(null, "", url);
}

export function pushUrlState(url: string): void {
  window.history.pushState(null, "", url);
}
