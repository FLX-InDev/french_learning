import { NextResponse, type NextRequest } from "next/server";

/**
 * 语言路由入口（C1 方案①）：所有不带 /zh|/en|/fr 前缀的旧地址（含 `/`）
 * 307 重定向到「cookie 记忆语言 → 中文」兜底的前缀地址。
 * `/api`、静态资源与带扩展名路径不参与。
 */
const LOCALES = ["zh", "en", "fr"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const first = pathname.split("/")[1];
  // `/` 由 app/page.tsx 处理（客户端导航可拿到 RSC 重定向）；已带前缀的直接放行
  if (pathname === "/" || LOCALES.includes(first)) return NextResponse.next();

  const stored = req.cookies.get("flx_locale")?.value;
  const locale = stored && LOCALES.includes(stored) ? stored : "zh";
  const dest = req.nextUrl.clone();
  dest.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(dest);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
