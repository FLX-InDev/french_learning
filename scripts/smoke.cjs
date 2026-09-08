#!/usr/bin/env node
/**
 * 路由冒烟脚本（B3 / P0-8）
 *
 * 用法：
 *   node scripts/smoke.cjs                        # 默认 http://localhost:3000
 *   node scripts/smoke.cjs http://localhost:3126  # 本地生产构建
 *   node scripts/smoke.cjs https://<vercel 域名>  # 生产环境（发布后冒烟）
 *
 * 退出码：全部 200 → 0；存在非 200 → 1（可用于 CI）。
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

async function check(route) {
  const url = BASE + route;
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: "follow" });
    return { route, status: res.status, ms: Date.now() - started };
  } catch (err) {
    return { route, status: "ERR", ms: Date.now() - started, error: String(err.message || err) };
  }
}

(async () => {
  console.log(`冒烟目标：${BASE}`);
  const results = [];
  for (const r of ROUTES) {
    // 串行请求，避免本地服务器瞬时并发抖动
    results.push(await check(r));
  }

  let failed = 0;
  for (const r of results) {
    const ok = r.status === 200;
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
