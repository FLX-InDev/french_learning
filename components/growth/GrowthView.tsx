"use client";
import { useAppState } from "@/components/AppStateProvider";
import { Mascot } from "@/components/Mascot";
import type { MascotStage } from "@/lib/workspace";

/** 吉祥物养成（T5D.1）：蛋→幼崽→少年→成年，fedCount 驱动 */
export function MascotPen() {
  const { state } = useAppState();
  const stage = stageFromFed(state?.mascot.fedCount ?? 0);
  const next = fedForNext(stage);
  const fed = state?.mascot.fedCount ?? 0;
  return <div className="text-center py-4">
    <Mascot mood={stage === "egg" ? "idle" : stage === "baby" ? "encourage" : "happy"} size={120} className="mx-auto" />
    <div className="mt-2 font-bold text-gray-800">{STAGE_LABEL[stage]}</div>
    <div className="text-xs text-gray-400 mt-1">已喂食 {fed} 次{next > 0 ? ` · 下一阶段还需 ${next - fed} 次` : " · 已满级!"}</div>
    <div className="h-2 rounded-full bg-purple-50 mt-2 overflow-hidden max-w-[200px] mx-auto"><div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all" style={{ width: `${Math.min(100, (fed / Math.max(1, next)) * 100)}%` }} /></div>
  </div>;
}

export const STAGE_LABEL: Record<MascotStage, string> = { egg: "🥚 狐狸蛋", baby: "🐣 幼崽", teen: "🦊 少年", adult: "🦊 成年" };

function stageFromFed(fed: number): MascotStage { return fed >= 30 ? "adult" : fed >= 15 ? "teen" : fed >= 5 ? "baby" : "egg"; }
function fedForNext(s: MascotStage): number { return s === "egg" ? 5 : s === "baby" ? 15 : s === "teen" ? 30 : -1; }

// ── 成就勋章（T5D.2）───────────────────────────────────────────────
export type Badge = { id: string; emoji: string; name: string; check: (s: ReturnType<typeof import("@/components/AppStateProvider").useAppState>["state"]) => boolean };

export const BADGES: Badge[] = [
  { id: "first-speak", emoji: "🎤", name: "首次跟读", check: (s) => !!s?.sessions.some((x) => x.quiz.questions.some((q) => q.mode === "speak")) },
  { id: "streak-7", emoji: "🔥", name: "连续 7 天打卡", check: (s) => computeStreak(s?.checkins ?? []) >= 7 },
  { id: "alphabets", emoji: "🔤", name: "字母表通关", check: (s) => Object.values(s?.wordProgress ?? {}).filter((v) => v === "flipped" || v === "correct" || v === "spoken").length >= 52 },
  { id: "songs-5", emoji: "🎵", name: "听完 5 首儿歌", check: (s) => Object.values(s?.taskFlags ?? {}).filter((v) => typeof v === "string" && v.length > 0).length >= 5 },
];

function computeStreak(checkins: string[]): number {
  let d = new Date(); const today = d.toISOString().slice(0, 10);
  if (!checkins.includes(today)) d.setDate(d.getDate() - 1);
  let s = 0; while (checkins.includes(d.toISOString().slice(0, 10))) { s++; d.setDate(d.getDate() - 1); } return s;
}

export function BadgeWall() {
  const { state } = useAppState();
  const earned = BADGES.filter((b) => b.check(state));
  return <div className="grid grid-cols-2 gap-2">
    {BADGES.map((b) => { const has = earned.some((e) => e.id === b.id);
      return <div key={b.id} className={"rounded-xl border-2 p-3 text-center " + (has ? "border-amber-300 bg-amber-50" : "border-gray-100 bg-white opacity-60")}><div className="text-2xl">{b.emoji}</div><div className="text-xs font-bold mt-1">{b.name}</div><div className="text-[10px] text-gray-400">{has ? "✅ 已获得" : "未解锁"}</div></div>;
    })}</div>;
}

// ── 每日任务清单（T5D.3）────────────────────────────────────────────
export const DAILY_QUESTS = [
  { id: "checkin", emoji: "✅", label: "每日打卡" },
  { id: "challenge", emoji: "🎯", label: "完成每日挑战" },
  { id: "song", emoji: "🎵", label: "听一首儿歌" },
  { id: "speak", emoji: "🎤", label: "跟读 3 句" },
  { id: "math", emoji: "🔢", label: "完成 1 道数学题" },
];

export function DailyQuestList() {
  const { state, update } = useAppState();
  const today = new Date().toISOString().slice(0, 10);
  const taskFlags = state?.taskFlags ?? {};
  const quests = DAILY_QUESTS.map((q) => ({ ...q, done: taskFlags[`quest_${q.id}`] === today }));
  function complete(id: string) {
    if (!update || !state || taskFlags[`quest_${id}`] === today) return;
    update((s) => ({ ...s, taskFlags: { ...s.taskFlags, [`quest_${id}`]: today }, points: { total: s.points.total + 5, history: [...s.points.history, { date: today, delta: 5, reason: `每日任务：${DAILY_QUESTS.find((x) => x.id === id)?.label ?? id}` }] } }));
  }
  return <div className="space-y-1.5">{quests.map((q) => <button key={q.id} onClick={() => complete(q.id)} disabled={q.done} className={"w-full rounded-xl border-2 p-3 text-left flex items-center gap-3 transition " + (q.done ? "bg-green-50 border-green-200" : "bg-white border-gray-100 hover:border-purple-300")}><span className="text-xl">{q.emoji}</span><span className="flex-1 text-sm font-semibold">{q.label}</span><span className="text-xs text-gray-400">{q.done ? "✓ 已完成 +5" : "+5 分"}</span></button>)}</div>;
}