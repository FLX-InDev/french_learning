import type { TracePoint } from "./letterStrokes";

/**
 * 描红命中判定（纯几何，无 DOM / 无 i18n / 无 React）。
 *
 * 坐标一律是画布归一化空间（`[0,100]`，y 轴向下）：阈值因此与屏幕尺寸无关，
 * 300px 画布上 1 单位 ≈ 3px。参考笔点距约 3.2 单位、用户笔约 1.2 单位，
 * 密度不同 → **必须先按弧长重采样再比对**，不能按点位下标对齐。
 *
 * 判据只有三要素（起笔命中 / 轨迹在带内 / 写到末端）。**不单独判方向**：
 * 倒着写的笔迹必然同时落在「起笔半径之外」或「末端覆盖不足」里，
 * 再加一条方向判据既不可达也只会制造误拒。
 */

export type JudgeThresholds = {
  /** 要素 a：起笔点到参考起笔的最大距离 */
  startTol: number;
  /** 要素 b：用户点到参考折线的最大允许垂直距离 */
  perpTol: number;
  /** 要素 b：落在容差带内的采样点比例下限 */
  perpPassRatio: number;
  /** 要素 b：垂直距离中位数上限，堵掉「贴带边蹭 + 三成点乱飞」 */
  perpMedianMax: number;
  /** 要素 c：沿参考弧长的覆盖跨度下限 */
  coverageMin: number;
  /** 要素 c：末点投影位置 / 参考长度下限（写到接近末端） */
  tailMin: number;
  /** 轨迹过短（< refLen × 本值）不出结论 */
  minUserLenRatio: number;
  /** 轨迹过短的绝对下限（单位） */
  minUserLenAbs: number;
  /** 重采样间距（1.2 与 3.2 的几何均值） */
  resampleSpacing: number;
};

export const DEFAULT_THRESHOLDS: JudgeThresholds = {
  startTol: 8,
  perpTol: 10,
  perpMedianMax: 8,
  perpPassRatio: 0.7,
  coverageMin: 0.8,
  tailMin: 0.85,
  minUserLenRatio: 0.35,
  minUserLenAbs: 6,
  resampleSpacing: 2.5,
};

export type JudgeReason = "offStart" | "offPath" | "incomplete";

export type JudgeMetrics = {
  refLen: number;
  userLen: number;
  startDist: number;
  headS: number;
  tailS: number;
  span: number;
  perpPass: number;
  perpMedian: number;
};

export type Match = {
  status: "ok" | "retry" | "ignored";
  reasons: JudgeReason[];
  metrics: JudgeMetrics;
};

function dist(a: TracePoint, b: TracePoint): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** 逐点累计弧长（首项恒为 0） */
export function cumulativeArc(pts: TracePoint[]): number[] {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + dist(pts[i - 1], pts[i]));
  return acc;
}

export function pathLength(pts: TracePoint[]): number {
  const acc = cumulativeArc(pts);
  return acc[acc.length - 1] ?? 0;
}

function lerp(a: TracePoint, b: TracePoint, t: number): TracePoint {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** 按弧长等距重采样；末点始终保留，避免覆盖率因稀疏采样被低估 */
export function resampleByArc(pts: TracePoint[], spacing: number): TracePoint[] {
  if (pts.length < 2 || spacing <= 0) return pts.slice();
  const acc = cumulativeArc(pts);
  const total = acc[acc.length - 1] ?? 0;
  if (total <= 0) return [pts[0], pts[pts.length - 1]];
  const out: TracePoint[] = [];
  let seg = 1;
  for (let s = 0; s <= total; s += spacing) {
    while (seg < pts.length - 1 && acc[seg] < s) seg += 1;
    const segLen = acc[seg] - acc[seg - 1];
    const t = segLen > 0 ? (s - acc[seg - 1]) / segLen : 0;
    out.push(lerp(pts[seg - 1], pts[seg], Math.max(0, Math.min(1, t))));
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (!tail || dist(tail, last) > spacing / 2) out.push(last);
  return out;
}

/** 点到折线的最近投影：返回弧长位置 s 与垂直距离 perp */
export function project(p: TracePoint, poly: TracePoint[], cum: number[]): { s: number; perp: number } {
  let best = { s: 0, perp: Infinity };
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1];
    const b = poly[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    const segLen = cum[i] - cum[i - 1];
    const t =
      lenSq > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq)) : 0;
    const d = dist(p, lerp(a, b, t));
    if (d < best.perp) best = { s: cum[i - 1] + t * segLen, perp: d };
  }
  return best;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 三要素判定：起笔命中（a）+ 轨迹在带内（b）+ 写到末端（c）。
 * 三者**同时**成立才 ok——单看起笔不够（同档内相邻两笔起点最近间距仅 7.6 单位）。
 */
export function matchStroke(
  user: TracePoint[],
  ref: TracePoint[],
  th: JudgeThresholds = DEFAULT_THRESHOLDS
): Match {
  const refLen = pathLength(ref);
  const userLen = pathLength(user);
  const metrics: JudgeMetrics = {
    refLen,
    userLen,
    startDist: 0,
    headS: 0,
    tailS: 0,
    span: 0,
    perpPass: 0,
    perpMedian: 0,
  };

  if (user.length < 2 || ref.length < 2 || refLen <= 0) {
    return { status: "ignored", reasons: [], metrics };
  }
  // 轻描一下 / 短促点触：不出结论，也不记失败次数
  if (userLen < Math.max(th.minUserLenAbs, refLen * th.minUserLenRatio)) {
    return { status: "ignored", reasons: [], metrics };
  }

  const reasons: JudgeReason[] = [];
  const startDist = dist(user[0], ref[0]);
  metrics.startDist = startDist;
  if (startDist > th.startTol) reasons.push("offStart");

  const cum = cumulativeArc(ref);
  const samples = resampleByArc(user, th.resampleSpacing);
  const projections = samples.map((p) => project(p, ref, cum));
  const perps = projections.map((q) => q.perp);

  metrics.perpPass =
    perps.length > 0 ? perps.filter((d) => d <= th.perpTol).length / perps.length : 0;
  metrics.perpMedian = median(perps);
  if (perps.length < 3) {
    // 两点快甩：样本太少，比例没有统计意义——要求全部在带内
    if (!perps.every((d) => d <= th.perpTol)) reasons.push("offPath");
  } else if (metrics.perpPass < th.perpPassRatio || metrics.perpMedian > th.perpMedianMax) {
    // 比例管「大部分点得在带里」，中位数管「别整条都贴着带边蹭」
    reasons.push("offPath");
  }

  const headS = projections[0]?.s ?? 0;
  const tailS = projections[projections.length - 1]?.s ?? 0;
  let minS = Infinity;
  let maxS = -Infinity;
  for (const q of projections) {
    if (q.s < minS) minS = q.s;
    if (q.s > maxS) maxS = q.s;
  }
  metrics.headS = headS / refLen;
  metrics.tailS = tailS / refLen;
  metrics.span = (maxS - minS) / refLen;

  if (metrics.span < th.coverageMin || metrics.tailS < th.tailMin) reasons.push("incomplete");

  return { status: reasons.length === 0 ? "ok" : "retry", reasons, metrics };
}

export type JudgeResult = Match & {
  /** 轨迹其实匹配的是第 k 笔（0 基），让提示能说「这是第 3 笔，先写第 1 笔」 */
  matchedIndex?: number;
};

/**
 * 判定所需的全部外部输入：阈值 + 文案 key，由上层（汉字模块）注入。
 * `InkTrace` 只按 key 取词，不硬编码任何语言的判定文案——字母通道没有判定，也不会读到这些 key。
 */
export type JudgeConfig = {
  thresholds: JudgeThresholds;
  /** 失败原因 → 提示文案 key */
  hints: Record<JudgeReason, string>;
  text: {
    /** 常态引导语（判定通道不用字母通道的「不判分」文案） */
    idle: string;
    /** 参数 `{i}` 当前笔序 / `{n}` 总笔数 */
    progress: string;
    /** 全部写齐 */
    done: string;
    /** 参数 `{k}` 实际命中的笔序 / `{n}` 期望的笔序 */
    otherStroke: string;
    /** 一笔连写多笔时的提醒 */
    oneByOne: string;
  };
  /** 同一笔连错多少次后自动只回放这一笔（默认 3） */
  failsForHint?: number;
};

/**
 * 先按期望笔序判定；不合格时对其余笔试一遍，
 * 好让提示给出具体的「你写的是第 k 笔」而不是笼统的「再试一次」。
 */
export function judgeAgainstAll(
  user: TracePoint[],
  refs: TracePoint[][],
  expected: number,
  th: JudgeThresholds = DEFAULT_THRESHOLDS
): JudgeResult {
  const ref = refs[expected];
  if (!ref) return { ...matchStroke(user, [], th) };
  const match = matchStroke(user, ref, th);
  if (match.status !== "retry") return match;

  for (let i = 0; i < refs.length; i++) {
    if (i === expected) continue;
    if (matchStroke(user, refs[i], th).status === "ok") return { ...match, matchedIndex: i };
  }
  return match;
}
