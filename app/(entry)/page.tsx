import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale } from "@/lib/workspace";

/**
 * `/` 入口：按 cookie 记忆的界面语言跳转到对应语言前缀路由（C1 方案①）。
 * 保留为页面（而非仅 middleware）以便客户端导航（<Link href="/">）也能正确重定向。
 */
export const dynamic = "force-dynamic";

export default function RootPage() {
  const stored = cookies().get("flx_locale")?.value;
  redirect(`/${isLocale(stored) ? stored : DEFAULT_LOCALE}`);
}
