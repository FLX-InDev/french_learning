"use client";

import type {
  ColorName,
  MathQuestion,
  ShapeName,
} from "@/lib/mathGenerator";
import { SHAPE_COLORS, decodeMotifToken } from "@/lib/mathGenerator";
import { useI18n } from "@/lib/i18n";

/**
 * 数学题卡（PRD §7.7.2）：按 kind / visual 渲染题面。
 * 生成器题与固定题（source: "fixed"）共用本管线。
 */

const COLOR_HEX: Record<string, string> = Object.fromEntries(
  SHAPE_COLORS.map((c) => [c.name, c.hex])
);

/** 几何图形图块：纯色 SVG，跨平台一致（emoji 几何符号颜色不可控） */
export function ShapeGlyph({
  shape,
  color,
  className = "w-16 h-16",
}: {
  shape: ShapeName;
  color: ColorName;
  className?: string;
}) {
  const fill = COLOR_HEX[color] ?? "#a855f7";
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={shape}>
      {shape === "cercle" && <circle cx="50" cy="50" r="42" fill={fill} />}
      {shape === "carré" && <rect x="12" y="12" width="76" height="76" rx="6" fill={fill} />}
      {shape === "rectangle" && <rect x="6" y="26" width="88" height="48" rx="6" fill={fill} />}
      {shape === "triangle" && <polygon points="50,8 94,90 6,90" fill={fill} />}
      {shape === "étoile" && (
        <polygon
          points="50,14 58.8,39.9 86.1,40.3 64.3,56.6 72.3,82.7 50,67 27.7,82.7 35.7,56.6 13.9,40.3 41.2,39.9"
          fill={fill}
        />
      )}
      {shape === "cœur" && (
        <path
          d="M50 80 C24 60 18 36 37 30 C46 27 50 36 50 36 C50 36 54 27 63 30 C82 36 76 60 50 80 Z"
          fill={fill}
        />
      )}
    </svg>
  );
}


/** 指针表盘插图：时针/分针角度与 hour:minute 严格对等 */
function ClockFace({ hour, minute }: { hour: number; minute: number }) {
  const hand = (angleDeg: number, len: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: 50 + len * Math.cos(rad), y: 50 + len * Math.sin(rad) };
  };
  const h = hand(((hour % 12) + minute / 60) * 30, 22);
  const m = hand(minute * 6, 33);
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-40 h-40"
      role="img"
      aria-label={`${hour}:${String(minute).padStart(2, "0")}`}
    >
      <circle cx="50" cy="50" r="47" fill="white" stroke="#a855f7" strokeWidth="3" />
      {Array.from({ length: 60 }, (_, i) =>
        i % 5 === 0 ? null : (
          <circle
            key={i}
            cx={50 + 43.5 * Math.cos(((i * 6 - 90) * Math.PI) / 180)}
            cy={50 + 43.5 * Math.sin(((i * 6 - 90) * Math.PI) / 180)}
            r="0.7"
            fill="#d1d5db"
          />
        )
      )}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (((i + 1) * 30 - 90) * Math.PI) / 180;
        return (
          <text
            key={i}
            x={50 + 37.5 * Math.cos(a)}
            y={50 + 37.5 * Math.sin(a) + 4}
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            fill="#6b7280"
          >
            {i + 1}
          </text>
        );
      })}
      <line x1="50" y1="50" x2={h.x} y2={h.y} stroke="#7c3aed" strokeWidth="4.5" strokeLinecap="round" />
      <line x1="50" y1="50" x2={m.x} y2={m.y} stroke="#ec4899" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="50" cy="50" r="2.8" fill="#374151" />
    </svg>
  );
}

export function MathQuestionCard({ q }: { q: MathQuestion }) {
  const v = q.visual;
  const { t, locale } = useI18n();

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
      <p className="text-sm text-gray-500 mb-4">{q.prompt[locale]}</p>

      {/* 固定题无程序化 visual：仅渲染题干与图片位 */}
      {!v && (
        <div className="text-4xl mb-2">{q.image || "📝"}</div>
      )}

      {v && "emoji" in v && "count" in v && (
        <div className="text-4xl leading-relaxed tracking-widest break-all">
          {Array.from({ length: v.count }, (_, i) => (
            <span key={i}>{v.emoji}</span>
          ))}
        </div>
      )}

      {v && "left" in v && (
        <div className="flex items-center justify-center gap-4">
          {/* 两侧各占一半宽度并允许换行：16+ 个 emoji 不再撑破卡片 */}
          <div className="flex-1 min-w-0 flex flex-wrap content-center justify-center text-3xl leading-relaxed tracking-widest">
            {Array.from({ length: v.left.count }, (_, i) => (
              <span key={i}>{v.left.emoji}</span>
            ))}
          </div>
          <div className="text-4xl font-bold text-purple-500 shrink-0">?</div>
          <div className="flex-1 min-w-0 flex flex-wrap content-center justify-center text-3xl leading-relaxed tracking-widest">
            {Array.from({ length: v.right.count }, (_, i) => (
              <span key={i}>{v.right.emoji}</span>
            ))}
          </div>
        </div>
      )}

      {v && "a" in v && "b" in v && "op" in v && !("type" in v && v.type === "columnar") && (
        <div className="text-5xl font-extrabold text-gray-800 tabular-nums">
          {v.a} {v.op} {v.b} = ?
        </div>
      )}

      {/* 竖式（乘除竖式，感知阶段）：横式 + 竖式布局 */}
      {v && "type" in v && v.type === "columnar" && (
        <div className="flex items-center justify-center gap-6">
          <div className="text-5xl font-extrabold text-gray-800 tabular-nums">
            {v.a} {v.op} {v.b} = ?
          </div>
          {v.op === "÷" && (
            <div className="text-left font-bold text-gray-700 tabular-nums leading-tight">
              <div className="text-xs text-gray-400 mb-0.5">{t('l6.columnar.hint')}</div>
              <div className="text-lg">
                <div className="flex items-end gap-1">
                  <span className="text-2xl">{v.b}</span>
                  <span className="text-3xl">⟌</span>
                  <span className="text-2xl underline underline-offset-4">{v.a}</span>
                </div>
                <div className="mt-1 pl-8 text-sm text-gray-400">
                  ?
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 分数初步（识别：饼图/条图/emoji；比较：两分数并排） */}
      {v && "type" in v && v.type === "fraction" && (
        <div className="space-y-3">
          {v.style === "pie" && (
            <div className="flex justify-center">
              <div
                className="w-28 h-28 rounded-full border-2 border-gray-200 mx-auto"
                style={{
                  background: `conic-gradient(#f59e0b 0 ${(v.numerator / v.denominator) * 100}%, #f3f4f6 ${(v.numerator / v.denominator) * 100}% 100%)`,
                }}
              />
            </div>
          )}
          {v.style === "bar" && (
            <div className="flex rounded-lg overflow-hidden border border-gray-200 h-10 w-40 mx-auto">
              {Array.from({ length: v.denominator }, (_, i) => (
                <div
                  key={i}
                  className={
                    i < v.numerator ? "bg-amber-500 flex-1" : "bg-gray-100 flex-1"
                  }
                  style={{
                    borderRight:
                      i < v.denominator - 1 ? "2px solid #fff" : undefined,
                  }}
                />
              ))}
            </div>
          )}
          {v.style === "emoji" && (
            <div className="text-3xl tracking-widest break-all">
              {Array.from({ length: v.itemCount ?? v.denominator }, (_, i) => (
                <span
                  key={i}
                  className={
                    i < v.numerator ? "" : "opacity-25 grayscale"
                  }
                >
                  {v.emoji ?? "🍕"}
                </span>
              ))}
            </div>
          )}
          {v.other && (
            <div className="flex items-center justify-center gap-6 text-4xl font-extrabold text-gray-800 tabular-nums">
              <span>
                {v.numerator}/{v.denominator}
              </span>
              <span className="text-purple-500">○</span>
              <span>
                {v.other.numerator}/{v.other.denominator}
              </span>
            </div>
          )}
        </div>
      )}

      {v && "tens" in v && (
        <div className="space-y-2">
          {"hundreds" in v && v.hundreds ? (
            <div className="text-2xl tracking-widest">
              {Array.from({ length: v.hundreds }, (_, i) => (
                <span key={`h${i}`}>🟥</span>
              ))}
            </div>
          ) : null}
          <div className="text-2xl tracking-widest">
            {Array.from({ length: v.tens }, (_, i) => (
              <span key={`t${i}`}>🟦</span>
            ))}
          </div>
          <div className="text-2xl tracking-widest">
            {Array.from({ length: v.ones }, (_, i) => (
              <span key={`o${i}`}>🟨</span>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            {t('math.placeholderLegend')}
          </p>
        </div>
      )}

      {v && "items" in v && "step" in v && (
        <div className="text-4xl font-bold text-gray-800 tabular-nums flex items-center justify-center gap-3">
          {v.items.map((it, i) => (
            <span
              key={i}
              className={
                it === "?" ? "text-purple-500 underline underline-offset-8" : ""
              }
            >
              {it}
            </span>
          ))}
        </div>
      )}

      {v && "hour" in v && (
        <div className="flex justify-center py-1">
          <ClockFace hour={v.hour} minute={v.minute} />
        </div>
      )}

      {v && "type" in v && v.type === "shape" && (
        <div className="flex justify-center py-2">
          <ShapeGlyph shape={v.shape} color={v.color} className="w-32 h-32" />
        </div>
      )}

      {v && "type" in v && v.type === "motif" && (
        <div className="flex items-center justify-center gap-2 flex-wrap py-2">
          {v.items.map((tk, i) => {
            const d = tk ? decodeMotifToken(tk) : null;
            return (
              <span
                key={i}
                className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gray-50 border border-gray-100"
              >
                {d ? (
                  <ShapeGlyph shape={d.shape} color={d.color} className="w-11 h-11" />
                ) : (
                  <span className="text-3xl font-bold text-purple-500">?</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {v && "type" in v && v.type === "countFr" && (
        <div className="flex flex-wrap items-center justify-center gap-2 py-2 max-w-xs mx-auto">
          {Array.from({ length: v.count }, (_, i) => (
            <ShapeGlyph key={i} shape={v.shape} color={v.color} className="w-10 h-10" />
          ))}
        </div>
      )}

      {/* 长度/质量单位 */}
      {v && "type" in v && (v.type === "length" || v.type === "mass") && (
        <div className="space-y-2">
          <div className="text-3xl font-bold text-gray-800 tabular-nums">
            {v.value} {v.fromUnit} = ?
          </div>
          <p className="text-sm text-gray-500">
            = ___ {v.toUnit}
          </p>
        </div>
      )}

      {/* 轴对称图形 */}
      {v && "type" in v && v.type === "symmetry" && (
        <div className="flex flex-col items-center gap-2">
          <div className="text-7xl">{v.shape}</div>
          <p className="text-xs text-gray-400">?</p>
        </div>
      )}

      {v && "emoji" in v && "op" in v && v.op === "×" ? null : null}

      {/* 凑十/破十分解（可重放展开）由关卡页控制显示 */}
      {q.unit && <p className="text-xs text-gray-400 mt-2">{t('math.unit', { unit: q.unit })}</p>}
    </div>
  );
}

/** 凑十/破十分解步骤展示（PRD §7.7.3，可重放） */
export function DecompositionSteps({
  steps,
}: {
  steps: { label: { zh: string; en: string; fr: string }; text: string }[];
}) {
  const { t, locale } = useI18n();
  return (
    <div className="bg-purple-50 rounded-xl p-4 mt-3 space-y-2">
      <p className="text-xs font-semibold text-purple-600">
        {t('math.decompositionSteps')}
      </p>
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs bg-purple-600 text-white rounded-full px-2 py-0.5 shrink-0">
            {s.label[locale]}
          </span>
          <span className="text-lg font-bold text-gray-800 tabular-nums">
            {s.text}
          </span>
        </div>
      ))}
    </div>
  );
}
