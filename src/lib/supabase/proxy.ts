import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const isIngreign = request.nextUrl.pathname === "/ingreign" || request.nextUrl.pathname.startsWith("/ingreign/");
  const isAdminLogin = request.nextUrl.pathname.startsWith("/admin/login");
  const isIngreignLogin = request.nextUrl.pathname.startsWith("/ingreign/login");
  const isIngreignPublicAsset = isIngreign && (
    request.nextUrl.pathname === "/ingreign/manifest.webmanifest"
    || /\.(?:png|svg|ico)$/i.test(request.nextUrl.pathname)
  );
  const isLogin = isAdminLogin || isIngreignLogin;

  if (!data?.claims && !isLogin && !isIngreignPublicAsset) {
    const url = request.nextUrl.clone();
    url.pathname = isIngreign ? "/ingreign/login" : "/admin/login";
    if (!isIngreign) url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (data?.claims && isIngreignLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/ingreign";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (data?.claims && isAdminLogin) return response;

  return response;
}
