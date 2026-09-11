"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { useI18n } from "@/lib/i18n";
import { quizResult } from "@/lib/workspace";
import { getLevelConfig, type Subject } from "@/lib/levels";
import {
  buildReportSvg,
  downloadBlob,
  reportFileName,
  subjectAccuracy,
  svgToPngBlob,
  type ReportData,
  type ReportLabels,
} from "@/lib/reportExport";

/**
 * 家长周报（T5D.4）+ 导出图片（T6-05，S4）。
 *
 * 同源保证：`report`（useMemo）与 `labels`（useMemo）各算一次，
 * 页面渲染与 `buildReportSvg` 读同一对象 → 导出图与页面同值（验收 ③）。
 * 导出零依赖：自研 SVG → Canvas → PNG（G-4）。
 */
export function WeeklyReport() {
  const { state } = useAppState();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const report = useMemo<ReportData | null>(() => {
    if (!state) return null;
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr = weekAgo.toISOString().slice(0, 10);
    const s = state.sessions.filter((x) => x.date >= weekStr);
    const days = new Set(s.map((x) => x.date)).size;
    const totalMin = s.reduce((a, x) => a + x.durationMin, 0);
    const bySubject: ReportData["bySubject"] = {
      language: { count: 0, correct: 0, total: 0 },
      math: { count: 0, correct: 0, total: 0 },
      logic: { count: 0, correct: 0, total: 0 },
      life: { count: 0, correct: 0, total: 0 },
    };
    s.forEach((sess) => {
      const sub = sess.subject ?? "language";
      const r = quizResult(sess);
      bySubject[sub].count++;
      bySubject[sub].correct += r.score;
      bySubject[sub].total += r.total;
    });
    const mistakes: { fr: string; subject: string }[] = [];
    s.forEach((sess) =>
      sess.quiz.questions.forEach((q) => {
        if (q.userIndex !== null && q.userIndex !== q.correctIndex)
          mistakes.push({ fr: q.fr, subject: sess.subject ?? "language" });
      })
    );
    const level = state.profile.level;
    const cfg = getLevelConfig(level);
    const passed =
      cfg.passScore !== null
        ? state.sessions.filter((x) =>
            x.quiz.questions.some(
              (q) => q.mode === "speak" && (q.score ?? 0) >= (cfg.passScore ?? 0)
            )
          ).length
        : 0;
    return {
      days,
      totalMin,
      totalSessions: s.length,
      bySubject,
      mistakes,
      level,
      levelName: cfg.cnName,
      passed,
    };
  }, [state]);

  // 页面与导出图共用同一份文案（同源同值）
  const labels = useMemo<ReportLabels>(
    () => ({
      title: t("reportExport.title"),
      days: t("reportExport.days"),
      time: t("reportExport.time"),
      sessions: t("reportExport.sessions"),
      subjectTitle: t("reportExport.subjectTitle"),
      mistakesTitle: t("reportExport.mistakesTitle"),
      level: t("reportExport.level"),
      speakPassed: t("reportExport.speakPassed"),
      unitDay: t("reportExport.unitDay"),
      unitMin: t("reportExport.unitMin"),
      unitCount: t("reportExport.unitCount"),
      unitTimes: t("reportExport.unitTimes"),
      subjectNames: {
        language: t("reportExport.subject.language"),
        math: t("reportExport.subject.math"),
        logic: t("reportExport.subject.logic"),
        life: t("reportExport.subject.life"),
      },
    }),
    [t]
  );

  async function onExport() {
    if (!report || busy) return;
    setBusy(true);
    setError(null);
    try {
      const svg = buildReportSvg(report, labels);
      const png = await svgToPngBlob(svg);
      downloadBlob(png, reportFileName(new Date()));
    } catch {
      setError(t("reportExport.error"));
    } finally {
      setBusy(false);
    }
  }

  if (!report) return <div className="text-gray-400">{t("reportExport.empty")}</div>;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-gray-400">{labels.level}：{report.levelName}</div>
        <button
          onClick={onExport}
          disabled={busy}
          aria-label={t("reportExport.btn")}
          className={
            "min-h-[44px] px-4 rounded-full text-xs font-bold transition " +
            (busy
              ? "bg-gray-100 text-gray-400 cursor-wait"
              : "bg-purple-600 text-white hover:bg-purple-700")
          }
        >
          {busy ? t("reportExport.busy") : `🖼️ ${t("reportExport.btn")}`}
        </button>
      </div>
      {error && (
        <div role="alert" className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Stat label={labels.days} value={`${report.days} ${labels.unitDay}`} />
        <Stat label={labels.time} value={`${report.totalMin} ${labels.unitMin}`} />
        <Stat label={labels.sessions} value={`${report.totalSessions} ${labels.unitCount}`} />
      </div>

      <div className="font-bold text-gray-700">{labels.subjectTitle}</div>
      {(["language", "math", "logic"] as Subject[]).map((sub) => {
        const acc = subjectAccuracy(report.bySubject[sub]);
        return (
          <div key={sub} className="flex items-center gap-2">
            <span className="w-12 text-xs text-gray-500">{labels.subjectNames[sub]}</span>
            <div className="flex-1 h-2 rounded-full bg-purple-50">
              <div className="h-full rounded-full bg-purple-500" style={{ width: `${acc}%` }} />
            </div>
            <span className="text-xs font-bold w-8 text-right">{acc}%</span>
          </div>
        );
      })}

      <div className="font-bold text-gray-700">{labels.mistakesTitle}</div>
      {report.mistakes.slice(0, 3).map((m, i) => (
        <div key={i} className="text-xs text-gray-500 flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 text-[10px]">
            {labels.subjectNames[m.subject as Subject] ?? m.subject}
          </span>
          « {m.fr} »
        </div>
      ))}

      <div className="text-xs text-gray-400">
        {labels.speakPassed}：{report.passed} {labels.unitTimes}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-purple-50 rounded-xl p-2 text-center">
      <div className="text-lg font-extrabold text-purple-600">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

/** 统计分学科视图（T5D.5）集成到工作台 */
export function SubjectStats({
  sessions,
}: {
  sessions: import("@/lib/workspace").StudySession[];
}) {
  const { t } = useI18n();
  const by = useMemo(() => {
    const m: Record<Subject, { count: number; correct: number; total: number }> = {
      language: { count: 0, correct: 0, total: 0 },
      math: { count: 0, correct: 0, total: 0 },
      logic: { count: 0, correct: 0, total: 0 },
      life: { count: 0, correct: 0, total: 0 },
    };
    sessions.forEach((s) => {
      const sub = s.subject ?? "language";
      const r = quizResult(s);
      m[sub].count++;
      m[sub].correct += r.score;
      m[sub].total += r.total;
    });
    return m;
  }, [sessions]);
  const names: Record<Subject, string> = {
    language: t("reportExport.subject.language"),
    math: t("reportExport.subject.math"),
    logic: t("reportExport.subject.logic"),
    life: t("reportExport.subject.life"),
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["language", "math", "logic"] as Subject[]).map((sub) => {
        const acc = subjectAccuracy(by[sub]);
        return (
          <div key={sub} className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="text-xs text-gray-500">{names[sub]}</div>
            <div className="text-lg font-bold text-gray-800">{acc}%</div>
            <div className="text-[10px] text-gray-400">
              {by[sub].count} {t("reportExport.unitCount")}
            </div>
          </div>
        );
      })}
    </div>
  );
}
