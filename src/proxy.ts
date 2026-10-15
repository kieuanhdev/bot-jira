import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy-Report-Only":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';",
};

export function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * Validates if an Origin matches a Host header.
 * Handles standard hostnames, ports, and x-forwarded-host lists.
 */
export function isSameOrigin(
  origin: string | null | undefined,
  host: string | null | undefined
): boolean {
  if (!origin || !host) return false;
  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host.toLowerCase();
    const cleanHost = host.split(",")[0].trim().toLowerCase();
    if (!cleanHost) return false;

    if (originHost === cleanHost) {
      return true;
    }

    // Default port normalizations (e.g. cleanHost includes :80/:443 or vice versa)
    if (
      cleanHost.endsWith(":80") &&
      originUrl.protocol === "http:" &&
      cleanHost.slice(0, -3) === originHost
    ) {
      return true;
    }
    if (
      cleanHost.endsWith(":443") &&
      originUrl.protocol === "https:" &&
      cleanHost.slice(0, -4) === originHost
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isMutatingApiRequest(method: string, pathname: string): boolean {
  if (!MUTATING_METHODS.has(method.toUpperCase())) {
    return false;
  }
  if (!pathname.startsWith("/api/")) {
    return false;
  }
  if (
    pathname === "/api/webhooks" ||
    pathname.startsWith("/api/webhooks/") ||
    pathname === "/api/auth" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/chat" ||
    pathname.startsWith("/api/chat/")
  ) {
    return false;
  }
  return true;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isMutatingApiRequest(request.method, pathname)) {
    const origin = request.headers.get("origin");
    if (origin) {
      const host =
        request.headers.get("x-forwarded-host") || request.headers.get("host");
      if (!isSameOrigin(origin, host)) {
        return applySecurityHeaders(
          NextResponse.json({ error: "forbidden_origin" }, { status: 403 })
        );
      }
    }
  }

  const response = NextResponse.next();
  return applySecurityHeaders(response);
}

export default proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except for static files:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
