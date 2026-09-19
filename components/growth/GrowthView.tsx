"use client";
import { useAppState } from "@/components/AppStateProvider";
import { useI18n } from "@/lib/i18n";
import { Mascot } from "@/components/Mascot";
import type { MascotStage } from "@/lib/workspace";

/** 吉祥物养成（T5D.1）：蛋→幼崽→少年→成年，fedCount 驱动 */
export function MascotPen() {
  const { t } = useI18n();
  const { state } = useAppState();
  const stage = stageFromFed(state?.mascot.fedCount ?? 0);
  const next = fedForNext(stage);
  const fed = state?.mascot.fedCount ?? 0;
  return <div className="text-center py-4">
    <Mascot mood={stage === "egg" ? "idle" : stage === "baby" ? "encourage" : "happy"} size={120} className="mx-auto" />
    <div className="mt-2 font-bold text-gray-800">{t(STAGE_LABEL_KEY[stage])}</div>
    <div className="text-xs text-gray-400 mt-1">
      {t("growth.fedCount", { fed: String(fed) })}
      {next > 0
        ? " · " + t("growth.nextStageNeeded", { n: String(next - fed) })
        : " · " + t("growth.maxLevel")}
    </div>
    <div className="h-2 rounded-full bg-purple-50 mt-2 overflow-hidden max-w-[200px] mx-auto"><div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all" style={{ width: `${Math.min(100, (fed / Math.max(1, next)) * 100)}%` }} /></div>
  </div>;
}

/** 阶段名改为 i18n key（三语由字典提供） */
export const STAGE_LABEL_KEY: Record<MascotStage, string> = {
  egg: "growth.stageEgg",
  baby: "growth.stageCub",
  teen: "growth.stageJuvenile",
  adult: "growth.stageAdult",
};

function stageFromFed(fed: number): MascotStage { return fed >= 30 ? "adult" : fed >= 15 ? "teen" : fed >= 5 ? "baby" : "egg"; }
function fedForNext(s: MascotStage): number { return s === "egg" ? 5 : s === "baby" ? 15 : s === "teen" ? 30 : -1; }

// ── 成就勋章（T5D.2）───────────────────────────────────────────────
export type Badge = { id: string; emoji: string; nameKey: string; check: (s: ReturnType<typeof import("@/components/AppStateProvider").useAppState>["state"]) => boolean };

export const BADGES: Badge[] = [
  { id: "first-speak", emoji: "🎤", nameKey: "growth.achievementFirstRead", check: (s) => !!s?.sessions.some((x) => x.quiz.questions.some((q) => q.mode === "speak")) },
  { id: "streak-7", emoji: "🔥", nameKey: "growth.achievement7DayStreak", check: (s) => computeStreak(s?.checkins ?? []) >= 7 },
  { id: "alphabets", emoji: "🔤", nameKey: "growth.achievementAlphabet", check: (s) => Object.values(s?.wordProgress ?? {}).filter((v) => v === "flipped" || v === "correct" || v === "spoken").length >= 52 },
  { id: "songs-5", emoji: "🎵", nameKey: "growth.achievement5Songs", check: (s) => Object.values(s?.taskFlags ?? {}).filter((v) => typeof v === "string" && v.length > 0).length >= 5 },
];

function computeStreak(checkins: string[]): number {
  const d = new Date(); const today = d.toISOString().slice(0, 10);
  if (!checkins.includes(today)) d.setDate(d.getDate() - 1);
  let s = 0; while (checkins.includes(d.toISOString().slice(0, 10))) { s++; d.setDate(d.getDate() - 1); } return s;
}

export function BadgeWall() {
  const { t } = useI18n();
  const { state } = useAppState();
  const earned = BADGES.filter((b) => b.check(state));
  return <div className="grid grid-cols-2 gap-2">
    {BADGES.map((b) => { const has = earned.some((e) => e.id === b.id);
      return <div key={b.id} className={"rounded-xl border-2 p-3 text-center " + (has ? "border-amber-300 bg-amber-50" : "border-gray-100 bg-white opacity-60")}><div className="text-2xl">{b.emoji}</div><div className="text-xs font-bold mt-1">{t(b.nameKey)}</div><div className="text-[10px] text-gray-400">{has ? t("growth.achieved") : t("growth.locked")}</div></div>;
    })}</div>;
}

// ── 每日任务清单（T5D.3）────────────────────────────────────────────
export const DAILY_QUESTS = [
  { id: "checkin", emoji: "✅", labelKey: "growth.questCheckin" },
  { id: "challenge", emoji: "🎯", labelKey: "growth.questDailyChallenge" },
  { id: "song", emoji: "🎵", labelKey: "growth.questSong" },
  { id: "speak", emoji: "🎤", labelKey: "growth.questRead3" },
  { id: "math", emoji: "🔢", labelKey: "growth.questMath1" },
];

export function DailyQuestList() {
  const { t } = useI18n();
  const { state, update } = useAppState();
  const today = new Date().toISOString().slice(0, 10);
  const taskFlags = state?.taskFlags ?? {};
  const quests = DAILY_QUESTS.map((q) => ({ ...q, done: taskFlags[`quest_${q.id}`] === today }));
  function complete(id: string) {
    if (!update || !state || taskFlags[`quest_${id}`] === today) return;
    const label = t(DAILY_QUESTS.find((x) => x.id === id)?.labelKey ?? "growth.questCheckin");
    update((s) => ({ ...s, taskFlags: { ...s.taskFlags, [`quest_${id}`]: today }, points: { total: s.points.total + 5, history: [...s.points.history, { date: today, delta: 5, reason: t("growth.questPrefix") + label }] } }));
  }
  return <div className="space-y-1.5">{quests.map((q) => <button key={q.id} onClick={() => complete(q.id)} disabled={q.done} className={"w-full rounded-xl border-2 p-3 text-left flex items-center gap-3 transition " + (q.done ? "bg-green-50 border-green-200" : "bg-white border-gray-100 hover:border-purple-300")}><span className="text-xl">{q.emoji}</span><span className="flex-1 text-sm font-semibold">{t(q.labelKey)}</span><span className="text-xs text-gray-400">{q.done ? t("growth.questDone") : t("growth.questReward")}</span></button>)}</div>;
}
