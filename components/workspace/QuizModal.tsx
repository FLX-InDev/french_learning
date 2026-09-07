"use client";

import {
  accColor,
  mdLabel,
  quizResult,
  type StudySession,
} from "@/lib/workspace";
import { QuestionCard } from "./QuestionCard";

/** 测验点评弹窗内容（从 WorkspaceView 拆分，逻辑未改动） */
export function QuizModal({
  session,
  onClose,
  onReview,
  onPlay,
}: {
  session: StudySession;
  onClose: () => void;
  onReview: () => void;
  onPlay: (text: string) => void;
}) {
  const r = quizResult(session);
  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-lg font-bold text-gray-800">
            {session.quiz.title}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {mdLabel(session.date)} · {session.contentRef.title} · 时长{" "}
            {session.durationMin} 分钟
          </div>
        </div>
        <button
          className="w-9 h-9 rounded-full bg-purple-50 text-purple-600 text-lg shrink-0"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="flex items-center gap-4 bg-purple-50 rounded-xl p-3 mb-4">
        <div>
          <div className="text-xl font-extrabold text-purple-600">
            {r.score}/{r.total}
          </div>
          <div className="text-xs text-gray-500">答对题数</div>
        </div>
        <div>
          <div
            className="text-xl font-extrabold"
            style={{ color: accColor(r.acc) }}
          >
            {r.acc}%
          </div>
          <div className="text-xs text-gray-500">正确率</div>
        </div>
        <div className="flex-1 text-right">
          {session.reviewed ? (
            <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-green-50 text-green-600">
              已点评
            </span>
          ) : (
            <button className="btn-primary" onClick={onReview}>
              标记已点评 +5
            </button>
          )}
        </div>
      </div>
      <div className="space-y-3">
        {session.quiz.questions.map((q, i) => (
          <QuestionCard key={i} q={q} index={i} onPlay={onPlay} />
        ))}
      </div>
    </div>
  );
}
