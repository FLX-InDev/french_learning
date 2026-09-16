"use client";

/**
 * 拼读卡（Phase 6 T6-07，PRD §7.5.6；契约 §2.4：`<PhonicsCardView card onSolved />`）
 *
 * 交互（点选等价路径，P-2）：
 * - 🔊 播放整词 → 下方乱序「切分块」按顺序点选 → 放满自动判定；
 * - 判定口径：点选顺序拼接 === 整词（大小写/空白容错，由 lib/phonics 的切分保证）；
 * - 结果经 `onSolved(ok)` 回传（每日挑战据此结算），组件自身不写全局状态。
 *
 * 切分体系由 `card.parts` 决定（法语 L1–L3 为音节、L4+ 为字素；英语为 CVC 三卡）。
 */

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { cancelSpeech, playSfx, speak } from "@/lib/audioManager";
import { mulberry32, seedFromString } from "@/lib/mathGenerator";
import type { PhonicsCard } from "@/lib/phonics";

export function PhonicsCardView({
  card,
  onSolved,
  compact,
}: {
  card: PhonicsCard;
  onSolved?: (ok: boolean) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [placed, setPlaced] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);

  // 同一张卡的乱序结果稳定（种子 = 卡 id），刷新/重渲染不跳动
  const scrambled = useMemo(() => {
    const arr = card.parts.map((p, i) => ({ p, i }));
    const rng = mulberry32(seedFromString("phonics_" + card.id));
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }, [card.id, card.parts]);

  useEffect(() => {
    setPlaced([]);
    setChecked(false);
  }, [card.id]);

  const target = card.parts.join("");
  const assembled = placed.map((idx) => scrambled[idx].p).join("");
  const correct = checked && assembled === target;
  const full = placed.length === scrambled.length;

  function judge(next: number[]) {
    const ok = next.map((i) => scrambled[i].p).join("") === target;
    setChecked(true);
    onSolved?.(ok);
    playSfx(ok ? "correct" : "encourage");
  }

  function place(idx: number) {
    if (checked || placed.includes(idx)) return;
    const next = [...placed, idx];
    setPlaced(next);
    if (next.length === scrambled.length) judge(next);
  }

  function undoLast() {
    if (checked) return;
    setPlaced((p) => p.slice(0, -1));
  }

  function reset() {
    setPlaced([]);
    setChecked(false);
  }

  function play() {
    cancelSpeech();
    void speak(card.whole, card.lang);
  }

  return (
    <div
      className={
        "bg-white rounded-2xl border p-4 text-center " +
        (compact ? "border-gray-100" : "border-gray-100 shadow-sm")
      }
    >
      {/* 提示区：emoji + 播放（不提前展示整词拼写） */}
      <div className="flex items-center justify-center gap-3">
        <span className="text-5xl" aria-hidden>
          {card.emoji || "🔤"}
        </span>
        <div className="text-left">
          <div className="font-bold text-gray-800">{t("phonics.title")}</div>
          <div className="text-xs text-gray-400">
            {card.lang === "fr" ? "FR" : "EN"} · {card.parts.length}
          </div>
        </div>
        <button
          onClick={play}
          className="w-11 h-11 rounded-full bg-green-50 text-green-600 text-lg shrink-0 hover:bg-green-100"
          aria-label={t("phonics.play")}
          title={t("phonics.play")}
        >
          ▶
        </button>
      </div>

      <p className="mt-2 text-xs text-gray-400">{t("phonics.hint")}</p>

      {/* 答案槽 */}
      <div
        className={
          "flex flex-wrap justify-center gap-1.5 mt-3 " +
          (checked && !correct ? "animate-[shake_0.4s_ease]" : "")
        }
        role="group"
        aria-label={t("phonics.title")}
      >
        {scrambled.map((_, slot) => {
          const filledIdx = placed[slot];
          const chunk = filledIdx !== undefined ? scrambled[filledIdx].p : "";
          return (
            <button
              key={slot}
              onClick={undoLast}
              aria-label={chunk || `${t("phonics.title")} ${slot + 1}`}
              className={
                "min-w-[48px] h-12 px-2 rounded-lg border-2 text-lg font-bold transition flex items-center justify-center " +
                (checked
                  ? correct
                    ? "border-green-400 bg-green-50 text-green-700"
                    : "border-red-300 bg-red-50 text-red-600"
                  : filledIdx !== undefined
                  ? "border-purple-400 bg-purple-50 text-purple-700"
                  : "border-dashed border-gray-200 bg-gray-50 text-gray-300")
              }
            >
              {chunk || "·"}
            </button>
          );
        })}
      </div>

      {/* 乱序切分块 */}
      <div className="flex flex-wrap justify-center gap-2 mt-3">
        {scrambled.map((tile, i) => {
          const used = placed.includes(i);
          return (
            <button
              key={i}
              onClick={() => place(i)}
              disabled={used || checked}
              className={
                "min-w-[48px] h-12 px-3 rounded-lg border-2 text-lg font-bold transition select-none " +
                (used
                  ? "border-gray-100 bg-gray-50 text-gray-200"
                  : "border-purple-200 bg-white text-gray-700 hover:border-purple-400 hover:bg-purple-50 active:scale-95")
              }
            >
              {tile.p}
            </button>
          );
        })}
      </div>

      {/* 结果 / 操作 */}
      <div className="flex items-center justify-center gap-2 mt-3 min-h-[40px]">
        {!checked ? (
          <span className="text-xs text-gray-300">
            {full ? "" : `${placed.length}/${scrambled.length}`}
          </span>
        ) : correct ? (
          <span className="text-green-600 font-bold">{t("phonics.correct")}</span>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {card.parts.join(" - ")}
            </span>
            <button className="btn-secondary min-h-[40px]" onClick={reset}>
              {t("phonics.retry")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
