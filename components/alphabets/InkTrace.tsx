"use client";

/**
 * 字母描红（Phase 6 T6-08 / S5，PRD §7.5.7）
 *
 * - 契约 D 冻结签名：`letter: string; lang: "fr" | "en"; onDone?: () => void`
 *   （另加可选 `style` / `className`，向后兼容）；
 * - **只回放不判分**：引导虚线 + 笔顺动画 + 用户轨迹记录 / 回放，不做正确性判定；
 * - 四线格（数据 `guides`）+ cursive `connect.entry/exit` 起收笔标记 + 统一倾斜引导；
 * - 手势：Pointer Events（手指 / 触控笔均可），`touch-action: none`，按钮 ≥ 48px，320px 宽可用；
 * - 组件**只交付自身**：不负责把自己挂到页面（挂载由上层 / I 决定）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  getLetterStroke,
  guideLines,
  hasCursiveVariant,
  resolveTraceKey,
  strokeDisplayRoles,
  traceGlyphsFromLetter,
  type TracePoint,
  type TraceStyle,
} from "./letterStrokes";

const GUIDE_COLOR = "#c7cbd6";
const PATH_DASH_COLOR = "#b9b2f0";
const PATH_SOLID_COLOR = "#7c5cf0";
const DIACRITIC_COLOR = "#f0a35c";
const USER_COLOR = "#f472b6";
const ENTRY_COLOR = "#22c55e";
const EXIT_COLOR = "#3b82f6";

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
}: {
  letter: string;
  lang: "fr" | "en";
  onDone?: () => void;
  style?: TraceStyle;
  className?: string;
}) {
  const { t } = useI18n();

  // 可描红字形（字母卡为成对形态时逐个切换）
  const glyphs = useMemo(
    () => traceGlyphsFromLetter(letter).filter((g) => resolveTraceKey(g, lang)),
    [letter, lang]
  );

  const [glyphIdx, setGlyphIdx] = useState(0);
  const [styleOverride, setStyleOverride] = useState<TraceStyle | null>(style ?? null);
  const [userStrokes, setUserStrokes] = useState<TracePoint[][]>([]);
  const [active, setActive] = useState<TracePoint[] | null>(null);
  const [playing, setPlaying] = useState<null | "guide" | "user">(null);
  const [size, setSize] = useState(300);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<{ strokeIdx: number; pointIdx: number }>({
    strokeIdx: 0,
    pointIdx: 0,
  });

  const glyph = glyphs[Math.min(glyphIdx, Math.max(0, glyphs.length - 1))];
  const key = glyph ? resolveTraceKey(glyph, lang, styleOverride ?? undefined) : undefined;
  const entry = key ? getLetterStroke(key) : undefined;

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

  // 字形 / 书写体切换时重置轨迹
  useEffect(() => {
    setUserStrokes([]);
    setActive(null);
    setPlaying(null);
    animRef.current = { strokeIdx: 0, pointIdx: 0 };
  }, [key]);

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

    if (!entry) return;

    // 四线格
    for (const line of guideLines(entry)) {
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

    // 倾斜引导（cursive）
    const slant = entry.guides.slant;
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

    const roles = strokeDisplayRoles(entry);

    // 引导路径：虚线全貌 + 已完成部分实线
    const anim = animRef.current;
    const animating = playing === "guide";
    entry.strokes.forEach((stroke, i) => {
      const pts = stroke.points.map(s);
      const color = roles[i] === "diacritic" ? DIACRITIC_COLOR : PATH_SOLID_COLOR;

      ctx.beginPath();
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = PATH_DASH_COLOR;
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.stroke();
      ctx.setLineDash([]);

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

    // cursive 连笔标记：entry 绿 / exit 蓝
    if (entry.connect) {
      const [ex, ey] = s(entry.connect.entry);
      const [xx, xy] = s(entry.connect.exit);
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
    const paintUser = (strokes: TracePoint[][], limit?: number) => {
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = USER_COLOR;
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

    if (playing === "user") {
      paintUser(userStrokes, anim.strokeIdx);
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
  }, [entry, size, playing, userStrokes, active]);

  const drawRef = useRef(draw);

  // 同步最新绘制函数（供 rAF 循环使用）并重绘
  useEffect(() => {
    drawRef.current = draw;
    draw();
  }, [draw]);

  // ─── 动画回放（笔顺 / 我的描红）─────────────────────────────────

  useEffect(() => {
    if (!playing) return;
    const strokes = playing === "guide" ? entry?.strokes.map((x) => x.points) : userStrokes;
    if (!strokes || strokes.length === 0) return; // 无可回放轨迹（按钮已禁用 / 清空时已复位）
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
    animRef.current = { strokeIdx: 0, pointIdx: 0 };
    let cancelled = false;
    let raf = 0;
    let strokeStart = 0;

    const step = (now: number) => {
      if (cancelled) return;
      if (!strokeStart) strokeStart = now;
      const cur = strokes[animRef.current.strokeIdx];
      if (!cur) {
        setPlaying(null);
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
  }, [playing, entry, userStrokes]);

  // ─── 手势描红（不判分，仅记录轨迹）──────────────────────────────

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
    if (active.length >= 2) setUserStrokes((prev) => [...prev, active]);
    setActive(null);
  }

  const hasCursive = glyph ? hasCursiveVariant(glyph) : false;
  const showStyleToggle = hasCursive && lang === "fr";

  if (!entry || !glyph) {
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

  return (
    <div className={className} data-testid="inktrace">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl font-extrabold text-gray-800 shrink-0">{glyph}</span>
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
                aria-pressed={(styleOverride ?? entry.style) === val}
                onClick={() => setStyleOverride(val)}
                className={
                  "px-3 py-2 rounded-full text-xs font-semibold min-h-[40px] " +
                  ((styleOverride ?? entry.style) === val
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

      <div ref={wrapRef} className="w-full">
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: size, maxWidth: size, touchAction: "none" }}
          role="img"
          aria-label={`${t("trace.canvasAlt")} ${glyph}（${entry.style}）`}
          className="rounded-2xl border-2 border-purple-100 bg-white cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>

      <p className="text-[11px] text-gray-400 mt-2 text-center">{t("trace.hint")}</p>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <button
          type="button"
          onClick={() => setPlaying(playing === "guide" ? null : "guide")}
          className="min-h-[48px] rounded-xl border-2 border-purple-200 text-purple-700 font-bold hover:border-purple-400"
        >
          {playing === "guide" ? `⏹ ${t("trace.stop")}` : `▶ ${t("trace.playStrokes")}`}
        </button>
        <button
          type="button"
          disabled={userStrokes.length === 0}
          onClick={() => setPlaying(playing === "user" ? null : "user")}
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

      {userStrokes.length > 0 && (
        <p className="text-[11px] text-pink-500 mt-2 text-center">
          {t("trace.strokeCount", { n: String(userStrokes.length) })}
        </p>
      )}
    </div>
  );
}
