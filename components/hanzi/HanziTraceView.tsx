"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { InkTrace } from "@/components/alphabets/InkTrace";
import { HANZI_JUDGE } from "./strokeJudge";
import {
  HANZI_CHARS,
  getHanziGlyph,
  hanziStrokeCount,
  toTraceBoard,
} from "./hanziStrokes";

/**
 * 汉字描红（中文 MVP + 笔顺判定）：一档（启蒙 21 字）+ 单字描红 + 笔顺回放 + 授权致谢。
 *
 * - 米字格与判定都走 `InkTrace` 的 `board` 通道；判定由 `board.judge`（契约 H）开启，
 *   **只给提示不打分**：同笔可无限重试，连错 3 次自动只回放这一笔；
 * - 字母描红不受影响，继续「只回放不判分」（契约 D / PRD §7.5.7）；
 * - 数据：`data/trace/hanzi/<档>.json`（骨架 hanzi-writer-data / ARPHIC PL 1.1，
 *   笔顺按 GF 0023-2020 审计，校订回流见 `data/trace/cn-writing/overrides/`）；
 * - 授权：致谢文案 + 授权原文随包分发（`public/legal/ARPHICPL.txt`）。
 */
export function HanziTraceView({ className }: { className?: string }) {
  const { t } = useI18n();
  const [idx, setIdx] = useState(0);

  const chars = HANZI_CHARS;
  const safeIdx = Math.min(idx, Math.max(0, chars.length - 1));
  const ch = chars[safeIdx];
  const entry = ch ? getHanziGlyph(ch) : undefined;
  const board = useMemo(
    () => (entry ? { ...toTraceBoard(entry), judge: HANZI_JUDGE } : undefined),
    [entry]
  );

  if (chars.length === 0 || !ch || !entry || !board) {
    return (
      <section className={"bg-white rounded-2xl shadow-sm border border-gray-100 p-5 " + (className ?? "")}>
        <h2 className="text-lg font-bold text-gray-800 mb-2">✒️ {t("hanziTrace.title")}</h2>
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-400">
          {t("hanziTrace.noData")}
        </div>
      </section>
    );
  }

  const step = (delta: number) => setIdx((i) => (i + delta + chars.length) % chars.length);

  return (
    <section className={"bg-white rounded-2xl shadow-sm border border-gray-100 p-5 " + (className ?? "")}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="text-lg font-bold text-gray-800">✒️ {t("hanziTrace.title")}</h2>
        <span className="text-xs text-gray-400 shrink-0">
          {t("hanziTrace.charOf", { i: String(safeIdx + 1), n: String(chars.length) })}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        {t("hanziTrace.bandLabel")}
        {" · "}
        {t("hanziTrace.strokesOf", { n: String(hanziStrokeCount(ch)) })}
        {" · "}
        {t("hanziTrace.replayNote")}
      </p>

      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={t("hanziTrace.charPrev")}
          className="shrink-0 min-h-[48px] min-w-[48px] rounded-xl border-2 border-gray-100 text-gray-500 hover:border-purple-300"
        >
          ‹
        </button>
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-1.5 py-1">
            {chars.map((c, i) => (
              <button
                key={c}
                type="button"
                onClick={() => setIdx(i)}
                aria-pressed={i === safeIdx}
                className={
                  "shrink-0 min-h-[48px] min-w-[48px] px-2 rounded-xl border-2 text-xl font-bold transition " +
                  (i === safeIdx
                    ? "border-purple-400 bg-purple-50 text-purple-700"
                    : "border-gray-100 text-gray-600 hover:border-purple-200")
                }
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label={t("hanziTrace.charNext")}
          className="shrink-0 min-h-[48px] min-w-[48px] rounded-xl border-2 border-gray-100 text-gray-500 hover:border-purple-300"
        >
          ›
        </button>
      </div>

      <InkTrace key={ch} board={board} />

      <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">{t("hanziTrace.attribution")}</p>
      <a
        href="/legal/ARPHICPL.txt"
        target="_blank"
        rel="noreferrer"
        className="inline-block text-[11px] text-purple-600 underline mt-1"
      >
        {t("hanziTrace.licenceLink")}
      </a>
    </section>
  );
}
