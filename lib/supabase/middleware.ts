import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

const PUBLIC_PREFIXES = ["/login", "/auth/callback"];

export async function updateSession(request: NextRequest) {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  const path = request.nextUrl.pathname;

  if (!url || !key) {
    if (path.startsWith("/dashboard")) {
      return NextResponse.redirect(new URL("/login?setup=1", request.url));
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(items: CookieToSet[]) {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const isPublic = path === "/" || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
  const isDashboard = path.startsWith("/dashboard");
  const isApi = path.startsWith("/api/");
  const isLegacyAuth = path.startsWith("/auth") && !path.startsWith("/auth/callback");

  if (isLegacyAuth) {
    return NextResponse.redirect(new URL(user ? "/dashboard" : "/login", request.url));
  }

  if (!user && isDashboard) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && path === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (user && path === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!user && !isPublic && !isDashboard && !isApi) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}
