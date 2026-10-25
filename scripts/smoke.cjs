#!/usr/bin/env node
/**
 * 路由冒烟脚本（B3 / P0-8）
 *
 * 用法：
 *   node scripts/smoke.cjs                        # 默认 http://localhost:3000
 *   node scripts/smoke.cjs http://localhost:3126  # 本地生产构建
 *   node scripts/smoke.cjs https://<vercel 域名>  # 生产环境（发布后冒烟）
 *
 * 校验旧地址跳转、三语页面的 SSR lang，以及未知地址的 404。
 */

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");

const ROUTES = [
  "/",
  "/sentences",
  "/stories",
  "/stories/1",
  "/words",
  "/alphabets",
  "/songs",
  "/dialogues",
  "/life",
  "/math",
  "/math/l4-addCarry",
  "/logic",
  "/workspace",
  "/parents",
  "/privacy",
];
const CASES = [
  ...ROUTES.map((route) => ({ route, locale: "zh", status: 200 })),
  ...["zh", "en", "fr"].flatMap((locale) => [
    ...ROUTES.map((route) => ({
      route: `/${locale}${route === "/" ? "" : route}`,
      locale,
      status: 200,
    })),
    { route: `/${locale}/missing-page`, locale, status: 404 },
  ]),
];

async function check({ route, locale, status }) {
  const url = BASE + route;
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: "follow" });
    const html = await res.text();
    const lang = html.match(/<html\b[^>]*\blang="([^"]+)"/)?.[1];
    const singleRoot = (html.match(/<html\b/g) || []).length === 1;
    const ok = res.status === status && (status === 404 || (lang === locale && singleRoot));
    return { route, status: res.status, ms: Date.now() - started, ok,
      error: ok ? undefined : `expected ${status}, lang=${locale}; got lang=${lang}, singleRoot=${singleRoot}` };
  } catch (err) {
    return { route, status: "ERR", ms: Date.now() - started, ok: false, error: String(err.message || err) };
  }
}

(async () => {
  console.log(`冒烟目标：${BASE}`);
  const results = [];
  for (const r of CASES) {
    // 串行请求，避免本地服务器瞬时并发抖动
    results.push(await check(r));
  }

  let failed = 0;
  for (const r of results) {
    const ok = r.ok;
    if (!ok) failed++;
    console.log(
      `${ok ? "✅" : "❌"} ${String(r.status).padEnd(4)} ${String(r.ms).padStart(5)}ms  ${r.route}${
        r.error ? "  → " + r.error : ""
      }`
    );
  }

  console.log(`\n合计 ${results.length} 条：通过 ${results.length - failed}，失败 ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
})();
