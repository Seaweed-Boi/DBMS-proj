import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Page-level RBAC. API routes enforce their own permissions in lib/api.ts.
const PAGE_ROLES: Record<string, string[]> = {
  "/users": ["ADMIN"],
  "/reports": ["ADMIN", "CENTRE_MANAGER", "COORDINATOR"],
};

export default withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role as string | undefined;
    const path = req.nextUrl.pathname;
    for (const [prefix, roles] of Object.entries(PAGE_ROLES)) {
      if (path.startsWith(prefix) && (!role || !roles.includes(role))) {
        return NextResponse.redirect(new URL("/?denied=1", req.url));
      }
    }
    return NextResponse.next();
  },
  { pages: { signIn: "/login" } },
);

export const config = {
  // Everything except auth endpoints, login page, API routes (self-guarded) and static assets.
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};
