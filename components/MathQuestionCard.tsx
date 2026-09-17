"use client";

import type { MathQuestion } from "@/lib/mathGenerator";
import { useI18n } from "@/lib/i18n";

/**
 * 数学题卡（PRD §7.7.2）：按 kind / visual 渲染题面。
 * 生成器题与固定题（source: "fixed"）共用本管线。
 */

function clockFace(hour: number, minute: number): string {
  // Emoji 表盘只有整点，半点用文字标注
  const clocks = ["🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚", "🕛"];
  return clocks[hour % 12];
}

export function MathQuestionCard({ q }: { q: MathQuestion }) {
  const v = q.visual;
  const { t } = useI18n();

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
      <p className="text-sm text-gray-500 mb-4">{q.prompt.zh}</p>

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
        <div className="flex items-center justify-center gap-6">
          <div className="text-3xl leading-relaxed tracking-widest">
            {Array.from({ length: v.left.count }, (_, i) => (
              <span key={i}>{v.left.emoji}</span>
            ))}
          </div>
          <div className="text-4xl font-bold text-purple-500">?</div>
          <div className="text-3xl leading-relaxed tracking-widest">
            {Array.from({ length: v.right.count }, (_, i) => (
              <span key={i}>{v.right.emoji}</span>
            ))}
          </div>
        </div>
      )}

      {v && "a" in v && "b" in v && "op" in v && v.op !== "×" && (
        <div className="text-5xl font-extrabold text-gray-800 tabular-nums">
          {v.a} {v.op} {v.b} = ?
        </div>
      )}

      {v && "a" in v && "b" in v && v.op === "×" && (
        <div className="text-5xl font-extrabold text-gray-800 tabular-nums">
          {v.a} × {v.b} = ?
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
                  {v.remainder > 0
                    ? `${v.result} … ${v.remainder}`
                    : String(v.result)}
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
        <div className="flex flex-col items-center gap-1">
          <div className="text-6xl">{clockFace(v.hour, v.minute)}</div>
          {v.minute !== 0 && (
            <span className="text-sm text-gray-500">{t('math.clockMinute', { v: String(v.minute) })}</span>
          )}
        </div>
      )}

      {v && "notes" in v && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {v.notes.map((n, i) => (
              <span
                key={i}
                className="inline-flex items-center justify-center min-w-[64px] px-3 py-2 rounded-lg bg-amber-50 border-2 border-amber-200 font-bold text-amber-700"
              >
                {v.currency === "CNY" ? "¥" : "€"}
                {n}
              </span>
            ))}
          </div>
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
          <p className="text-xs text-gray-400">
            {v.hasAxis ? t('math.symmetry.yes') : t('math.symmetry.no')}
          </p>
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
  const { t } = useI18n();
  return (
    <div className="bg-purple-50 rounded-xl p-4 mt-3 space-y-2">
      <p className="text-xs font-semibold text-purple-600">
        {t('math.decompositionSteps')}
      </p>
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs bg-purple-600 text-white rounded-full px-2 py-0.5 shrink-0">
            {s.label.zh}
          </span>
          <span className="text-lg font-bold text-gray-800 tabular-nums">
            {s.text}
          </span>
        </div>
      ))}
    </div>
  );
}
