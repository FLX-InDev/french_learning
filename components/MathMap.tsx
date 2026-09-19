"use client";

import { useRouter } from "next/navigation";
import { useI18n, localizedHref } from "@/lib/i18n";
import { useAppState } from "./AppStateProvider";
import { MATH_CURRICULUM, type MathStage } from "@/lib/mathCurriculum";
import { getLevelConfig } from "@/lib/levels";

/**
 * 数学关卡地图（PRD §7.7.1）：学段 → 知识点分组 → 关卡节点。
 * 节点状态：已得星 ⭐ / 进行中 🦊 / 未解锁 🔒（顺序解锁）。
 * 硬切换：升段新增关卡未解锁（历史星级保留）；降段隐藏但数据不丢。
 */
export function MathMap() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { state } = useAppState();
  const level = state?.profile.level ?? "L3";
  const groups = MATH_CURRICULUM[level];
  const cfg = getLevelConfig(level);

  if (!state) {
    return <div className="py-20 text-center text-gray-400">{t("workspace.loading")}</div>;
  }

  // 线性解锁：本学段关卡按顺序，前一关 ≥1 星才解锁下一关
  const stageOrder = groups.flatMap((g) => g.stages.map((s) => s.id));
  const unlockIndex = (() => {
    for (let i = 0; i < stageOrder.length; i++) {
      if ((state.rewards.levelStars[stageOrder[i]] ?? 0) === 0) return i;
    }
    return stageOrder.length - 1;
  })();
  const unlocked = new Set(stageOrder.slice(0, unlockIndex + 1));
  const nextStageId = stageOrder[unlockIndex];

  function nodeState(stage: MathStage): "done" | "current" | "locked" {
    if (!unlocked.has(stage.id)) return "locked";
    return (state?.rewards.levelStars[stage.id] ?? 0) > 0 ? "done" : "current";
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800">
          <span className="text-orange-500">🔢</span> {t("math.questTitle")}
        </h1>
        <p className="text-gray-500 mt-2 text-sm">
          {t("math.currentStage", {
            emoji: cfg.emoji,
            name: locale === "zh" ? cfg.cnName : cfg.frName,
            n: String(stageOrder.length),
          })}
        </p>
      </div>

      {/* 限时赛入口（T6-04 / S3，接入点补丁由 I 执行） */}
      <button
        type="button"
        onClick={() => router.push(localizedHref(locale, "/math/race"))}
        aria-label={t("race.entry")}
        className="w-full flex items-center justify-between gap-3 rounded-2xl border-2 border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-4 text-left transition hover:border-orange-400 hover:shadow-sm"
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className="text-3xl shrink-0">⏱️</span>
          <span className="min-w-0">
            <span className="block font-bold text-gray-800">
              {t("race.entry")}
            </span>
            <span className="block text-xs text-gray-500 truncate">
              {t("race.entryDesc")}
            </span>
          </span>
        </span>
        <span className="shrink-0 rounded-xl bg-orange-500 text-white font-bold px-4 py-3">
          →
        </span>
      </button>

      {groups.map((group) => (
        <section
          key={group.id}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5"
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{group.emoji}</span>
              <div>
                <h2 className="font-bold text-gray-800">{group.title[locale]}</h2>
                <p className="text-xs text-gray-400">{group.title.fr}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                {t("math.chinaProgressBadge", { progress: group.cnProgress })}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">
                {group.frBenchmark}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {group.stages.map((stage) => {
              const st = nodeState(stage);
              const stars = state.rewards.levelStars[stage.id] ?? 0;
              return (
                <button
                  key={stage.id}
                  disabled={st === "locked"}
                  onClick={() => router.push(localizedHref(locale, `/math/${stage.id}`))}
                  aria-label={t("math.stageAria", { name: stage.title[locale] })}
                  className={
                    "rounded-xl border-2 p-3 text-left min-h-[72px] transition " +
                    (st === "locked"
                      ? "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
                      : "border-purple-100 bg-white hover:border-purple-400 hover:shadow-sm")
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xl">
                      {st === "locked" ? "🔒" : st === "current" ? "🦊" : "⭐"}
                    </span>
                    <span className="text-xs text-amber-500 tracking-tight">
                      {"★".repeat(stars)}
                      {"☆".repeat(3 - stars)}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-gray-800">
                    {stage.title[locale]}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {t("math.questionCount", { n: String(stage.count) })} · {stage.kind}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <p className="text-center text-xs text-gray-400 pb-4">
        {t("math.starLegend")}
      </p>
    </div>
  );
}
