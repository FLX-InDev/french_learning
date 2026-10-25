"use client";

/**
 * 字母描红（Phase 6 T6-08 / S5，PRD §7.5.7）
 *
 * - 契约 D 冻结签名：`letter: string; lang: "fr" | "en"; onDone?: () => void`
 *   （另加可选 `style` / `className`，向后兼容）；
 * - 字母通道**只回放不判分**（契约 D）：引导虚线 + 笔顺动画 + 用户轨迹记录 / 回放；
 * - 四线格（数据 `guides`）+ cursive `connect.entry/exit` 起收笔标记 + 统一倾斜引导；
 * - 手势：Pointer Events（手指 / 触控笔均可），`touch-action: none`，按钮 ≥ 48px，320px 宽可用；
 * - 组件**只交付自身**：不负责把自己挂到页面（挂载由上层 / I 决定）。
 *
 * **v1.8 加法扩展（中文描红 MVP）**：可选 `board` 属性直接喂渲染模型，跳过法语字形表解析，
 * `grid: "rice"` 时画**米字格**替代四线格。`letter + lang` 路径与原有行为逐字未变，
 * 契约 D 的既有调用方向后兼容（`lang` 变为可选，缺省 `"fr"`）。
 *
 * **v1.9 笔顺判定（契约 H，仅汉字）**：`board.judge` 存在时启用三要素命中判定
 * （起笔 / 轨迹带 / 写到末端），反馈只有「亮笔 + 鼓励音」与「轻抖 + 文案」两种，
 * 同一笔可无限重试，**不打分、不扣分、不阻塞**。判定门禁是 `board.judge` 而不是 `board`：
 * 字母路径与无 judge 的 board 路径行为逐字不变，契约 D「只回放不判分」对字母继续有效。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { playSfx } from "@/lib/audioManager";
import { judgeAgainstAll, type JudgeConfig } from "./strokeMatcher";
import {
  getLetterStroke,
  guideLines,
  hasCursiveVariant,
  resolveTraceKey,
  strokeDisplayRoles,
  traceGlyphsFromLetter,
  type StrokeKind,
  type TraceGuides,
  type TracePoint,
  type TraceStyle,
} from "./letterStrokes";

/** 直接交给画布的渲染模型（法语走 LETTER_STROKES，汉字由上层换算） */
export type TraceBoard = {
  glyph: string;
  strokes: { kind: StrokeKind; points: TracePoint[] }[];
  /** 参考网格：四线格（默认）或米字格 */
  grid?: "four-line" | "rice";
  /** four-line 网格需要参考线；rice 网格不读 */
  guides?: TraceGuides;
  connect?: { entry: TracePoint; exit: TracePoint };
  /** 仅供 aria-label 标注形态（如 hanzi / print / cursive） */
  variantLabel?: string;
  /** 笔顺判定配置；缺省 = 只回放不判分（契约 D / 契约 H 的分叉点） */
  judge?: JudgeConfig;
};

type TraceModel = {
  glyph: string;
  variant: string;
  grid: "four-line" | "rice";
  guides?: TraceGuides;
  strokes: TracePoint[][];
  roles: StrokeKind[];
  connect?: TraceBoard["connect"];
  slant?: number;
};

/** 米字格外沿留白，与 `data/trace/hanzi/*.json` 的 guides 口径一致 */
const RICE_PAD = 2;

const GUIDE_COLOR = "#c7cbd6";
const PATH_DASH_COLOR = "#b9b2f0";
const PATH_SOLID_COLOR = "#7c5cf0";
const DIACRITIC_COLOR = "#f0a35c";
const USER_COLOR = "#f472b6";
const ENTRY_COLOR = "#22c55e";
const EXIT_COLOR = "#3b82f6";
/** 判定模式下已确认的一笔：比在描的笔迹更实，让字「读起来是写满的」 */
const CONFIRMED_COLOR = "#e91e8c";
/** 被拒的手势：淡到只剩轮廓，保留痕迹但不干扰正写 */
const ATTEMPT_COLOR = "rgba(244,114,182,0.25)";

/**
 * 回放线速度（归一化单位/秒；画布边长 = 100 单位）。
 *
 * 改用「线速度」而非「每帧推进点数」：笔顺数据的点间距约 4.2 单位，
 * 而用户描红轨迹的点间距约 1.2–1.6 单位——若按点数推进，标准笔顺会比
 * 用户自己的描红快约 3.4 倍（一笔仅 ~150ms，幼儿看不清）。
 * 按弧长推进后两者速度一致；150 单位/秒 ≈ 原本「回放我的描红」的速度。
 */
const USER_REPLAY_UNITS_PER_SEC = 150;
/** 标准笔顺回放更慢：一笔约 0.75 秒（平均笔长 75 单位 ÷ 0.75s） */
const GUIDE_REPLAY_UNITS_PER_SEC = 100;
/** 笔与笔之间的停顿，让小朋友看清换笔 */
const STROKE_PAUSE_MS = 180;

function clamp01to100(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export function InkTrace({
  letter,
  lang,
  onDone,
  style,
  className,
  board,
}: {
  letter?: string;
  lang?: "fr" | "en";
  onDone?: () => void;
  style?: TraceStyle;
  className?: string;
  board?: TraceBoard;
}) {
  const { t } = useI18n();
  const effectiveLang = lang ?? "fr";

  // 可描红字形（字母卡为成对形态时逐个切换）
  const glyphs = useMemo(
    () =>
      board
        ? [board.glyph]
        : traceGlyphsFromLetter(letter ?? "").filter((g) => resolveTraceKey(g, effectiveLang)),
    [board, letter, effectiveLang]
  );

  const [glyphIdx, setGlyphIdx] = useState(0);
  const [styleOverride, setStyleOverride] = useState<TraceStyle | null>(style ?? null);

  const glyph = glyphs[Math.min(glyphIdx, Math.max(0, glyphs.length - 1))];
  const key = glyph ? resolveTraceKey(glyph, effectiveLang, styleOverride ?? undefined) : undefined;
  const entry = key ? getLetterStroke(key) : undefined;
  // 练习身份沿用原重置语义；同字形的新 board 对象不重建练习。
  const resetKey = board ? `board:${board.glyph}` : key;

  /** 两条数据源在此汇流成同一个渲染模型；下面 draw / 回放 / UI 只认 model */
  const model = useMemo<TraceModel | null>(() => {
    if (board) {
      // 无笔画的 board 画不出任何东西（含参考格之外的空画布），按「暂无数据」降级
      if (board.strokes.length === 0) return null;
      return {
        glyph: board.glyph,
        variant: board.variantLabel ?? "hanzi",
        grid: board.grid ?? ("four-line" as const),
        guides: board.guides,
        strokes: board.strokes.map((s) => s.points),
        roles: board.strokes.map((s) => s.kind) as StrokeKind[],
        connect: board.connect,
        slant: board.guides?.slant,
      };
    }
    if (!entry || !glyph) return null;
    return {
      glyph,
      variant: entry.style,
      grid: "four-line" as const,
      guides: entry.guides,
      strokes: entry.strokes.map((s) => s.points),
      roles: strokeDisplayRoles(entry),
      connect: entry.connect,
      slant: entry.guides.slant,
    };
  }, [board, entry, glyph]);

  if (!model) {
    return (
      <div className={className}>
        <div
          className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-400"
          data-testid="inktrace-empty"
        >
          {t("trace.noData")}
        </div>
        <p className="text-[11px] text-gray-400 mt-2 text-center">
          {t("trace.additiveNote")}
        </p>
      </div>
    );
  }

  // 书写体切换只在法语字母路径生效（board 模式由上层决定形态，无可切换项）
  const hasCursive = !board && glyph ? hasCursiveVariant(glyph) : false;
  const showStyleToggle = hasCursive && lang === "fr";

  return (
    <div className={className} data-testid="inktrace">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl font-extrabold text-gray-800 shrink-0">{model.glyph}</span>
          {glyphs.length > 1 && (
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setGlyphIdx((i) => (i - 1 + glyphs.length) % glyphs.length)}
                aria-label={t("trace.glyphPrev")}
                className="min-h-[48px] min-w-[48px] rounded-xl border-2 border-gray-100 text-gray-500 hover:border-purple-300"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setGlyphIdx((i) => (i + 1) % glyphs.length)}
                aria-label={t("trace.glyphNext")}
                className="min-h-[48px] min-w-[48px] rounded-xl border-2 border-gray-100 text-gray-500 hover:border-purple-300"
              >
                ›
              </button>
            </span>
          )}
        </div>
        {showStyleToggle && (
          <div className="flex rounded-full bg-purple-50 p-1" role="group" aria-label={t("trace.styleLabel")}>
            {(
              [
                ["print", t("trace.stylePrint")],
                ["cursive", t("trace.styleCursive")],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                aria-pressed={(styleOverride ?? model.variant) === val}
                onClick={() => setStyleOverride(val)}
                className={
                  "px-3 py-2 rounded-full text-xs font-semibold min-h-[40px] " +
                  ((styleOverride ?? model.variant) === val
                    ? "bg-purple-600 text-white"
                    : "text-purple-600")
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <InkTraceAttempt key={resetKey} model={model} judgeCfg={board?.judge} onDone={onDone} />
    </div>
  );
}

/** 仅练习随 resetKey 重建；选择控件、字形索引与书写体选择留在外壳。 */
function InkTraceAttempt({
  model,
  judgeCfg,
  onDone,
}: {
  model: TraceModel;
  judgeCfg?: JudgeConfig;
  onDone?: () => void;
}) {
  const { t } = useI18n();
  const [userStrokes, setUserStrokes] = useState<TracePoint[][]>([]);
  const [active, setActive] = useState<TracePoint[] | null>(null);
  const [playing, setPlaying] = useState<null | "guide" | "user">(null);
  const [size, setSize] = useState(300);

  // ─── 判定态（仅 board.judge 存在时启用；字母路径永远停留在初值） ───
  const judging = Boolean(judgeCfg);
  /** 被拒的手势：单独存，不进 userStrokes，于是「期望第几笔」仍等于 userStrokes.length */
  const [attempts, setAttempts] = useState<TracePoint[][]>([]);
  const [failStreak, setFailStreak] = useState(0);
  const [feedback, setFeedback] = useState<
    null | { kind: "retry" | "done"; key: string; params?: Record<string, string> }
  >(null);
  const [shaking, setShaking] = useState(false);
  /** 只回放第 N 笔（连续失败后的自动引导）；null = 从头回放 */
  const [singleGuide, setSingleGuide] = useState<number | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<{ strokeIdx: number; pointIdx: number }>({
    strokeIdx: 0,
    pointIdx: 0,
  });

  // 自适应画布尺寸（320px 宽可用；无 ResizeObserver 时用后备值）
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setSize(Math.max(200, Math.min(360, Math.round(w))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** 判定模式下正在写第几笔（0 基）。通过的进 userStrokes、被拒的进 attempts，公式不变 */
  const expectedIndex = userStrokes.length;

  // ─── 绘制 ───────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext?.("2d");
    if (!ctx) return; // 无 2D 上下文（测试 / 旧环境）时静默跳过，不影响其余功能

    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const s = (p: TracePoint): TracePoint => [(p[0] / 100) * size, (p[1] / 100) * size];

    if (model.grid === "rice") {
      // 米字格：外沿实线框 + 横竖中线 + 两条对角（对角更浅，避免抢笔画视线）
      const a = (RICE_PAD / 100) * size;
      const b = size - a;
      ctx.setLineDash([]);
      ctx.strokeStyle = GUIDE_COLOR;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(a, a, b - a, b - a);
      ctx.beginPath();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      ctx.moveTo(a, size / 2);
      ctx.lineTo(b, size / 2);
      ctx.moveTo(size / 2, a);
      ctx.lineTo(size / 2, b);
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = "#dbe0ea";
      ctx.moveTo(a, a);
      ctx.lineTo(b, b);
      ctx.moveTo(b, a);
      ctx.lineTo(a, b);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (model.guides) {
      // 四线格
      for (const line of guideLines(model.guides)) {
        const y = (line.y / 100) * size;
        ctx.beginPath();
        ctx.setLineDash(line.weight === "thick" ? [] : [4, 4]);
        ctx.lineWidth = line.weight === "thick" ? 2 : 1;
        ctx.strokeStyle = GUIDE_COLOR;
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // 倾斜引导（cursive）
    const slant = model.slant;
    if (slant) {
      const rad = (slant * Math.PI) / 180;
      const dx = Math.tan(rad) * size;
      ctx.save();
      ctx.strokeStyle = "#e6e2f8";
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1;
      for (const frac of [0.25, 0.75]) {
        ctx.beginPath();
        ctx.moveTo(size * frac, size);
        ctx.lineTo(size * frac + dx, 0);
        ctx.stroke();
      }
      ctx.restore();
      ctx.setLineDash([]);
    }

    const roles = model.roles;

    // 引导路径：虚线全貌 + 已完成部分实线
    const anim = animRef.current;
    const animating = playing === "guide";
    model.strokes.forEach((strokePts, i) => {
      // 判定模式下已写对的笔让位给用户自己的实色笔迹，不再叠一层参考虚线
      if (judging && i < expectedIndex) return;
      const pts = strokePts.map(s);
      const color = roles[i] === "diacritic" ? DIACRITIC_COLOR : PATH_SOLID_COLOR;

      ctx.beginPath();
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = PATH_DASH_COLOR;
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (animating && singleGuide !== null && i !== singleGuide) return;
      const drawnCount = !animating
        ? 0
        : i < anim.strokeIdx
          ? pts.length
          : i === anim.strokeIdx
            ? Math.max(2, anim.pointIdx)
            : 0;
      if (drawnCount < 2) return;

      ctx.beginPath();
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = color;
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1, drawnCount)) ctx.lineTo(p[0], p[1]);
      ctx.stroke();

      // 起笔圆点
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(pts[0][0], pts[0][1], 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 判定模式：把「要素 a」画成看得见的目标——期望笔的起笔圈
    if (judging && !playing && judgeCfg) {
      const target = model.strokes[expectedIndex];
      if (target && target.length > 0) {
        const [x, y] = s(target[0]);
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = ENTRY_COLOR;
        ctx.arc(x, y, (judgeCfg.thresholds.startTol / 100) * size, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.fillStyle = ENTRY_COLOR;
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // cursive 连笔标记：entry 绿 / exit 蓝
    if (model.connect) {
      const [ex, ey] = s(model.connect.entry);
      const [xx, xy] = s(model.connect.exit);
      ctx.beginPath();
      ctx.fillStyle = ENTRY_COLOR;
      ctx.arc(ex, ey, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = EXIT_COLOR;
      ctx.arc(xx, xy, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 用户描红轨迹（粉色）；limit 存在时按动画进度截断当前笔（回放中）
    const paintUser = (
      strokes: TracePoint[][],
      limit?: number,
      color = USER_COLOR,
      width = 5
    ) => {
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = color;
      strokes.forEach((stroke, i) => {
        if (limit !== undefined && i > limit) return;
        const pts = stroke.map(s);
        if (pts.length < 2) return;
        const count =
          limit !== undefined && i === limit
            ? Math.max(2, animRef.current.pointIdx)
            : pts.length;
        if (count < 2) return;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts.slice(1, count)) ctx.lineTo(p[0], p[1]);
        ctx.stroke();
      });
    };

    // 被拒的手势留在画面上（淡色），孩子看得见自己刚才那一笔落在哪
    if (judging && playing !== "user" && attempts.length > 0) {
      paintUser(attempts, undefined, ATTEMPT_COLOR, 4);
    }

    if (playing === "user") {
      paintUser(userStrokes, anim.strokeIdx);
    } else if (judging) {
      paintUser(userStrokes, undefined, CONFIRMED_COLOR, 6);
    } else {
      paintUser(userStrokes);
    }

    if (active && active.length > 1) {
      const pts = active.map(s);
      ctx.beginPath();
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = USER_COLOR;
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    }
  }, [model, size, playing, userStrokes, active, judging, judgeCfg, expectedIndex, attempts, singleGuide]);

  const drawRef = useRef(draw);
  const replayStrokesRef = useRef({ guide: model.strokes, user: userStrokes });

  // 同步最新绘制函数与下一次回放的数据；同 key 父级重渲染不重启正在进行的回放。
  useEffect(() => {
    drawRef.current = draw;
    replayStrokesRef.current = { guide: model.strokes, user: userStrokes };
    draw();
  }, [draw, model, userStrokes]);

  // ─── 动画回放（笔顺 / 我的描红）─────────────────────────────────

  useEffect(() => {
    if (!playing) return;
    const strokes = replayStrokesRef.current[playing];
    if (strokes.length === 0) return; // 无可回放轨迹（按钮已禁用 / 清空时已复位）
    // 单笔引导：动画从第 N 笔开始；startIdx 为 0 时（字母 / 完整回放）逐字等价于改造前
    const startIdx = playing === "guide" ? Math.min(singleGuide ?? 0, strokes.length - 1) : 0;
    if (startIdx < 0) return;
    const endIdx = playing === "guide" && singleGuide !== null ? startIdx + 1 : strokes.length;
    // 每笔的累计弧长（按线速度推进，抵消「点密度」差异）
    const cumLen = strokes.map((pts) => {
      const acc = [0];
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i][0] - pts[i - 1][0];
        const dy = pts[i][1] - pts[i - 1][1];
        acc.push(acc[i - 1] + Math.sqrt(dx * dx + dy * dy));
      }
      return acc;
    });
    animRef.current = { strokeIdx: startIdx, pointIdx: 0 };
    let cancelled = false;
    let raf = 0;
    let strokeStart = 0;

    const step = (now: number) => {
      if (cancelled) return;
      if (!strokeStart) strokeStart = now;
      const cur = strokes[animRef.current.strokeIdx];
      if (!cur || animRef.current.strokeIdx >= endIdx) {
        setPlaying(null);
        setSingleGuide(null); // 单笔引导放完就收，回到「描下一笔」的常态
        return;
      }
      const acc = cumLen[animRef.current.strokeIdx];
      const totalLen = acc[acc.length - 1] ?? 0;
      const elapsed = Math.max(0, now - strokeStart - STROKE_PAUSE_MS);
      const speed =
        playing === "guide"
          ? GUIDE_REPLAY_UNITS_PER_SEC
          : USER_REPLAY_UNITS_PER_SEC;
      const targetLen = (elapsed / 1000) * speed;
      // 按弧长定位当前笔已画到的点序号
      let idx = animRef.current.pointIdx;
      while (idx < acc.length - 1 && acc[idx] < targetLen) idx += 1;
      animRef.current.pointIdx = idx;
      if (targetLen >= totalLen) {
        // 本笔走完 → 换下一笔（重置计时，形成笔间停顿）
        animRef.current.strokeIdx += 1;
        animRef.current.pointIdx = 0;
        strokeStart = now;
      }
      drawRef.current();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [playing, singleGuide]);

  // ─── 手势描红（字母：不判分，仅记录轨迹；board.judge：按笔序判定）───

  const toNorm = (e: React.PointerEvent<HTMLCanvasElement>): TracePoint => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * 100 : 0;
    const y = rect.height > 0 ? ((e.clientY - rect.top) / rect.height) * 100 : 0;
    return [clamp01to100(x), clamp01to100(y)];
  };

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (playing) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setActive([toNorm(e)]);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!active || playing) return;
    const p = toNorm(e);
    const last = active[active.length - 1];
    if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 1.2) return;
    setActive([...active, p]);
  }

  function onPointerUp() {
    if (!active) return;
    const gesture = active;
    setActive(null);

    if (!judgeCfg) {
      if (gesture.length >= 2) setUserStrokes((prev) => [...prev, gesture]);
      return;
    }
    if (gesture.length < 2) return;

    const refs = model.strokes;
    const result = judgeAgainstAll(gesture, refs, expectedIndex, judgeCfg.thresholds);

    // 轻描一下 / 点触：不出结论、不留提示、不记失败次数
    if (result.status === "ignored") {
      setAttempts((prev) => [...prev, gesture]);
      return;
    }

    if (result.status === "ok") {
      setUserStrokes((prev) => [...prev, gesture]);
      setFailStreak(0);
      const finished = expectedIndex + 1 >= refs.length;
      playSfx(finished ? "star" : "correct");
      setFeedback(finished ? { kind: "done", key: judgeCfg.text.done } : null);
      return;
    }

    // 不合格：这一笔留在 attempts（淡色），期望 index 不动 → 同笔可无限重试
    setAttempts((prev) => [...prev, gesture]);
    const streak = failStreak + 1;
    setFailStreak(streak);
    setShaking(true);
    playSfx("encourage");
    setFeedback(
      result.matchedIndex !== undefined
        ? {
            kind: "retry",
            key: judgeCfg.text.otherStroke,
            params: { k: String(result.matchedIndex + 1), n: String(expectedIndex + 1) },
          }
        : streak >= (judgeCfg.failsForHint ?? 3)
          ? { kind: "retry", key: judgeCfg.text.oneByOne }
          : { kind: "retry", key: judgeCfg.hints[result.reasons[0] ?? "offStart"] }
    );

    // 同一笔连错够多次 → 自动只回放这一笔（是帮忙，不是惩罚）
    if (streak >= (judgeCfg.failsForHint ?? 3)) {
      setSingleGuide(expectedIndex);
      setPlaying("guide");
      setFailStreak(0);
    }
  }

  // 抖动动画靠 class 的增删重启（420ms 后撤掉，下次 retry 再加回来）
  useEffect(() => {
    if (!shaking) return;
    const id = setTimeout(() => setShaking(false), 420);
    return () => clearTimeout(id);
  }, [shaking]);

  return (
    <>
      <div
        ref={wrapRef}
        className={"w-full" + (shaking ? " animate-[shake_0.4s_ease] motion-reduce:animate-none" : "")}
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: size, maxWidth: size, touchAction: "none" }}
          role="img"
          aria-label={`${t("trace.canvasAlt")} ${model.glyph}（${model.variant}）`}
          className="rounded-2xl border-2 border-purple-100 bg-white cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>

      <p
        className={
          "text-[11px] mt-2 text-center " +
          (feedback?.kind === "retry"
            ? "text-amber-600"
            : feedback?.kind === "done"
              ? "text-emerald-600"
              : "text-gray-400")
        }
        aria-live="polite"
        data-testid="inktrace-feedback"
      >
        {feedback
          ? t(feedback.key, feedback.params)
          : judgeCfg
            ? t(judgeCfg.text.idle)
            : t("trace.hint")}
      </p>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <button
          type="button"
          onClick={() => {
            setSingleGuide(null);
            setPlaying(playing === "guide" ? null : "guide");
          }}
          className="min-h-[48px] rounded-xl border-2 border-purple-200 text-purple-700 font-bold hover:border-purple-400"
        >
          {playing === "guide" ? `⏹ ${t("trace.stop")}` : `▶ ${t("trace.playStrokes")}`}
        </button>
        <button
          type="button"
          disabled={userStrokes.length === 0}
          onClick={() => {
            setSingleGuide(null);
            setPlaying(playing === "user" ? null : "user");
          }}
          className="min-h-[48px] rounded-xl border-2 border-pink-200 text-pink-600 font-bold hover:border-pink-400 disabled:opacity-40 disabled:hover:border-pink-200"
        >
          {playing === "user" ? `⏹ ${t("trace.stop")}` : `▶ ${t("trace.replayMine")}`}
        </button>
        <button
          type="button"
          onClick={() => {
            setUserStrokes([]);
            setActive(null);
            setPlaying(null);
            setAttempts([]);
            setFailStreak(0);
            setFeedback(null);
            setSingleGuide(null);
            setShaking(false);
            animRef.current = { strokeIdx: 0, pointIdx: 0 };
          }}
          className="min-h-[48px] rounded-xl border-2 border-gray-200 text-gray-600 font-bold hover:border-gray-400"
        >
          🧽 {t("trace.clear")}
        </button>
        {onDone ? (
          <button
            type="button"
            onClick={onDone}
            className="btn-primary min-h-[48px]"
          >
            ✓ {t("trace.done")}
          </button>
        ) : (
          <span className="flex items-center justify-center text-[11px] text-gray-400 px-2 text-center">
            {t("trace.scratch")}
          </span>
        )}
      </div>

      {judgeCfg ? (
        // 判定模式：进度说的是「写到第几笔」，不是「描了几笔」
        <p className="text-[11px] text-pink-500 mt-2 text-center" data-testid="inktrace-progress">
          {t(judgeCfg.text.progress, {
            i: String(Math.min(expectedIndex + 1, model.strokes.length)),
            n: String(model.strokes.length),
          })}
        </p>
      ) : (
        userStrokes.length > 0 && (
          <p className="text-[11px] text-pink-500 mt-2 text-center">
            {t("trace.strokeCount", { n: String(userStrokes.length) })}
          </p>
        )
      )}
    </>
  );
}
