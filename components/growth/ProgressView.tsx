"use client";
import { useMemo } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { quizResult, SUBJECT_LABELS } from "@/lib/workspace";
import { getLevelConfig } from "@/lib/levels";
import type { Subject } from "@/lib/levels";

/** 家长周报（T5D.4）：纯前端渲染，数据来自 localStorage sessions */
export function WeeklyReport() {
  const { state } = useAppState();
  const report = useMemo(() => {
    if (!state) return null;
    const now = new Date(); const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr = weekAgo.toISOString().slice(0, 10);
    const s = state.sessions.filter((x) => x.date >= weekStr);
    const days = new Set(s.map((x) => x.date)).size;
    const totalMin = s.reduce((a, x) => a + x.durationMin, 0);
    const bySubject: Record<Subject, { count: number; correct: number; total: number }> = { language: { count: 0, correct: 0, total: 0 }, math: { count: 0, correct: 0, total: 0 }, logic: { count: 0, correct: 0, total: 0 }, life: { count: 0, correct: 0, total: 0 } };
    s.forEach((sess) => { const sub = sess.subject ?? "language"; const r = quizResult(sess); bySubject[sub].count++; bySubject[sub].correct += r.score; bySubject[sub].total += r.total; });
    const mistakes: { fr: string; subject: string }[] = [];
    s.forEach((sess) => sess.quiz.questions.forEach((q) => { if (q.userIndex !== null && q.userIndex !== q.correctIndex) mistakes.push({ fr: q.fr, subject: sess.subject ?? "language" }); }));
    const level = state.profile.level; const cfg = getLevelConfig(level);
    const passed = cfg.passScore !== null ? state.sessions.filter((x) => x.quiz.questions.some((q) => q.mode === "speak" && (q.score ?? 0) >= (cfg.passScore ?? 0))).length : 0;
    return { days, totalMin, bySubject, mistakes, level, passed, totalSessions: s.length };
  }, [state]);
  if (!report) return <div className="text-gray-400">暂无数据。</div>;
  return <div className="space-y-3 text-sm">
    <div className="grid grid-cols-3 gap-2"><Stat label="学习天数" value={report.days + " 天"} /><Stat label="总时长" value={report.totalMin + " 分钟"} /><Stat label="测验次数" value={report.totalSessions + " 次"} /></div>
    <div className="font-bold text-gray-700">分学科正确率</div>
    {(["language", "math", "logic"] as Subject[]).map((sub) => { const d = report.bySubject[sub]; const acc = d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0;
      return <div key={sub} className="flex items-center gap-2"><span className="w-12 text-xs text-gray-500">{SUBJECT_LABELS[sub]}</span><div className="flex-1 h-2 rounded-full bg-purple-50"><div className="h-full rounded-full bg-purple-500" style={{ width: `${acc}%` }} /></div><span className="text-xs font-bold w-8 text-right">{acc}%</span></div>; })}
    <div className="font-bold text-gray-700">错题 Top3</div>
    {report.mistakes.slice(0, 3).map((m, i) => <div key={i} className="text-xs text-gray-500 flex items-center gap-2"><span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 text-[10px]">{SUBJECT_LABELS[m.subject as Subject]}</span>« {m.fr} »</div>)}
    <div className="text-xs text-gray-400">当前学段：{getLevelConfig(report.level).cnName} · 跟读通过 {report.passed} 次</div>
  </div>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div className="bg-purple-50 rounded-xl p-2 text-center"><div className="text-lg font-extrabold text-purple-600">{value}</div><div className="text-xs text-gray-500">{label}</div></div>; }

/** 统计分学科视图（T5D.5）集成到工作台 */
export function SubjectStats({ sessions }: { sessions: import("@/lib/workspace").StudySession[] }) {
  const by = useMemo(() => {
    const m: Record<Subject, { count: number; correct: number; total: number }> = { language: { count: 0, correct: 0, total: 0 }, math: { count: 0, correct: 0, total: 0 }, logic: { count: 0, correct: 0, total: 0 }, life: { count: 0, correct: 0, total: 0 } };
    sessions.forEach((s) => { const sub = s.subject ?? "language"; const r = quizResult(s); m[sub].count++; m[sub].correct += r.score; m[sub].total += r.total; });
    return m;
  }, [sessions]);
  return <div className="grid grid-cols-2 gap-2">
    {(["language", "math", "logic"] as Subject[]).map((sub) => { const d = by[sub]; const acc = d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0;
      return <div key={sub} className="bg-white rounded-xl border border-gray-100 p-3"><div className="text-xs text-gray-500">{SUBJECT_LABELS[sub]}</div><div className="text-lg font-bold text-gray-800">{acc}%</div><div className="text-[10px] text-gray-400">{d.count} 次测验</div></div>; })}</div>;
}