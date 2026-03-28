import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
 
// Route → permission required to access it
const ROUTE_PERMISSIONS: Record<string, string[]> = {
  // Cut Planner
  "/dashboard/cut-planner":         ["admin", "cutter", "manager", "supervisor"],
  "/dashboard/cut-planner/batch":   ["admin", "cutter"],
  "/dashboard/cut-planner/manual":  ["admin", "cutter", "manager", "supervisor"],

  // History
  "/dashboard/history":             ["admin", "cutter", "manager", "supervisor"],

  // Analytics
  "/dashboard/waste":               ["admin", "manager", "supervisor"],
  "/dashboard/waste-comparison":    ["admin", "manager"],
  "/dashboard/usage":               ["admin", "manager", "supervisor"],
  "/dashboard/costs":               ["admin", "manager"],
  "/dashboard/trends":              ["admin", "manager"],
  "/dashboard/reports":             ["admin", "manager", "supervisor"],

  // Inventory sub-routes
  "/dashboard/inventory/reorder":          ["admin", "manager"],
  "/dashboard/inventory/purchase-orders":  ["admin", "manager"],

  // Management
  "/dashboard/materials":           ["admin", "manager"],
  "/dashboard/materials/types":     ["admin", "manager"],
  "/dashboard/materials/suppliers": ["admin", "manager"],
  "/dashboard/materials/pricing":   ["admin"],
  "/dashboard/settings/materials":  ["admin", "manager"],

  // Settings & Users
  "/dashboard/settings":            ["admin"],
};

export async function middleware(request: NextRequest) {
 
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;
    console.log("TEST");
  // Exit immediately for auth routes — prevents infinite redirect loop
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth")
  ) {
  
    return NextResponse.next();
  }
  //console.log("🍪 Cookies:", request.cookies.getAll().map(c => c.name));
  // Create a Supabase server client using request cookies
 
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Get the current session
  const { data: { session } } = await supabase.auth.getSession();
 
  // 1. Not logged in — redirect to login
  if (!session) {
    //console.log("WOW");
    const loginUrl = new URL("/auth/v2/login", request.url); // ← match your actual route
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl)
  }

  // 2. Check if this route has permission requirements
  const requiredRoles = getRequiredRoles(pathname);

  if (requiredRoles) {
    // Fetch the user's roles from profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("roles")
      .eq("id", session.user.id)
      .single();

    const userRoles: string[] = profile?.roles ?? ["member"];

    // Check if user has ANY of the required roles
    const hasAccess = requiredRoles.some(role => userRoles.includes(role));

    if (!hasAccess) {
      // Redirect to unauthorized page
      return NextResponse.redirect(new URL("/dashboard/unauthorized", request.url));
    }
  }

  return response;
}

// Match required roles for a given pathname
// Checks exact match first, then prefix match for nested routes
function getRequiredRoles(pathname: string): string[] | null {
  // Exact match
  if (ROUTE_PERMISSIONS[pathname]) {
    return ROUTE_PERMISSIONS[pathname];
  }

  // Prefix match — catches nested routes like /dashboard/materials/types/edit/123
  const matchedKey = Object.keys(ROUTE_PERMISSIONS)
    .sort((a, b) => b.length - a.length) // longest prefix wins
    .find(route => pathname.startsWith(route));

  return matchedKey ? ROUTE_PERMISSIONS[matchedKey] : null;
}

export const config = {
  matcher: [
    // Match all dashboard routes, skip static files and API routes
    "/dashboard/:path*",
   
  ],
};