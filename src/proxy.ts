import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Rewrites a Swedish page alias to the route folder that actually renders
 * it. `routes.ts` decides which spelling a `Link` gets built with; this is
 * what makes the alias resolve instead of 404ing.
 *
 * A rewrite, not a redirect: the address bar keeps showing the alias the
 * link pointed at, and Next never turns a client navigation into a full
 * page reload. The English path keeps working too — it's the real folder,
 * so it needs no entry here — and no cookie is read: the alias exists
 * regardless of which language a visitor's session happens to be in.
 */
const ALIASES: Record<string, string> = {
  "/samling": "/collection",
  "/projekt": "/projects",
  "/statistik": "/statistics",
  "/kostnader": "/costs",
  "/sokningar": "/searches",
};

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const target = ALIASES[pathname];
  if (target) {
    return NextResponse.rewrite(new URL(target, request.url));
  }

  if (pathname.startsWith("/projekt/")) {
    const slug = pathname.slice("/projekt/".length);
    return NextResponse.rewrite(new URL(`/projects/${slug}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/samling",
    "/projekt",
    "/projekt/:slug",
    "/statistik",
    "/kostnader",
    "/sokningar",
  ],
};
