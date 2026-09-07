"use client";

import type { MathQuestion } from "@/lib/mathGenerator";

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
            🟥 百位 · 🟦 十位 · 🟨 个位
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
            <span className="text-sm text-gray-500">分针指向 {v.minute} 分</span>
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

      {v && "emoji" in v && "op" in v && v.op === "×" ? null : null}

      {/* 凑十/破十分解（可重放展开）由关卡页控制显示 */}
      {q.unit && <p className="text-xs text-gray-400 mt-2">单位：{q.unit}</p>}
    </div>
  );
}

/** 凑十/破十分解步骤展示（PRD §7.7.3，可重放） */
export function DecompositionSteps({
  steps,
}: {
  steps: { label: { zh: string; en: string; fr: string }; text: string }[];
}) {
  return (
    <div className="bg-purple-50 rounded-xl p-4 mt-3 space-y-2">
      <p className="text-xs font-semibold text-purple-600">
        分解步骤（点按可重放）
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
