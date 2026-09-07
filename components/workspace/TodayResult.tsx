"use client";

import { accColor, quizResult, type StudySession } from "@/lib/workspace";

/** 今日学习成果卡片（从 WorkspaceView 拆分，逻辑未改动） */
export function TodayResult({
  session,
  onOpen,
}: {
  session: StudySession;
  onOpen: () => void;
}) {
  const r = quizResult(session);
  const C = 2 * Math.PI * 52;
  const off = C * (1 - r.acc / 100);
  const badge =
    session.contentRef.type === "story"
      ? "📖 故事"
      : session.contentRef.type === "sentence"
      ? "📝 句子"
      : "📚 综合";
  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative w-[120px] h-[120px] shrink-0">
        <svg viewBox="0 0 120 120" className="w-[120px] h-[120px]">
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke="#f3f4f6"
            strokeWidth="12"
          />
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke={accColor(r.acc)}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={off}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <b className="text-2xl text-purple-600">{r.acc}%</b>
          <span className="text-xs text-gray-500">正确率</span>
        </div>
      </div>
      <div className="flex-1 w-full space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-purple-50 text-purple-600">
            {badge}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500 w-10 shrink-0">时长</span>
          <span className="font-semibold text-gray-800">
            {session.durationMin} 分钟
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500 w-10 shrink-0">内容</span>
          <span className="font-semibold text-gray-800">
            {session.contentRef.title}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500 w-10 shrink-0">测验</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">
            {r.score} / {r.total} 题正确
          </span>
        </div>
        <button className="btn-primary mt-1" onClick={onOpen}>
          查看测试点评
        </button>
      </div>
    </div>
  );
}
