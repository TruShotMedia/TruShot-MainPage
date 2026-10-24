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
  const isAutopacific = request.nextUrl.pathname === "/autopacific" || request.nextUrl.pathname.startsWith("/autopacific/");
  const isLifestyle = request.nextUrl.pathname === "/lifestyle" || request.nextUrl.pathname.startsWith("/lifestyle/");
  const isAdminLogin = request.nextUrl.pathname.startsWith("/admin/login");
  const isIngreignLogin = request.nextUrl.pathname.startsWith("/ingreign/login");
  const isLifestyleLogin = request.nextUrl.pathname.startsWith("/lifestyle/login");
  const isIngreignPublicAsset = isIngreign && (
    request.nextUrl.pathname === "/ingreign/manifest.webmanifest"
    || /\.(?:png|svg|ico)$/i.test(request.nextUrl.pathname)
  );
  const isAutopacificPublicAsset = isAutopacific && (
    request.nextUrl.pathname === "/autopacific/manifest.webmanifest"
    || request.nextUrl.pathname.startsWith("/autopacific/icons/")
  );
  const isLifestylePublicAsset = isLifestyle && (
    request.nextUrl.pathname === "/lifestyle/manifest.webmanifest"
    || request.nextUrl.pathname.startsWith("/lifestyle/icons/")
  );
  const isLogin = isAdminLogin || isIngreignLogin || isLifestyleLogin;

  if (!data?.claims && !isLogin && !isIngreignPublicAsset && !isAutopacificPublicAsset && !isLifestylePublicAsset) {
    const url = request.nextUrl.clone();
    url.pathname = isIngreign ? "/ingreign/login" : isLifestyle ? "/lifestyle/login" : "/admin/login";
    if (!isIngreign && !isLifestyle) url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (data?.claims && isIngreignLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/ingreign";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const signedInEmail = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : "";
  if (data?.claims && isLifestyleLogin && signedInEmail === "info@fearlessau.com") {
    const url = request.nextUrl.clone();
    url.pathname = "/lifestyle";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (data?.claims && isAdminLogin) return response;

  return response;
}
