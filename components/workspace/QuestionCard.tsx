"use client";

import type { QuizQuestion } from "@/lib/workspace";

/** 测验点评中的单题卡片（从 WorkspaceView 拆分，逻辑未改动） */
export function QuestionCard({
  q,
  index,
  onPlay,
}: {
  q: QuizQuestion;
  index: number;
  onPlay: (text: string) => void;
}) {
  const labels = ["A", "B", "C", "D"];
  return (
    <div className="bg-purple-50 rounded-xl p-3">
      <div className="font-semibold text-sm text-gray-800 mb-2 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs shrink-0">
          {index + 1}
        </span>
        <button
          className="shrink-0 w-8 h-8 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center hover:bg-purple-700 transition"
          onClick={() => onPlay(q.fr)}
          title="播放法语发音"
        >
          🔊
        </button>
        <span className="italic">« {q.fr} » 是什么意思？</span>
      </div>
      <div className="space-y-1.5">
        {q.options.map((opt, o) => {
          const isCorrect = o === q.correctIndex;
          const isUserWrong = q.userIndex === o && o !== q.correctIndex;
          let cls = "border border-purple-100 bg-white";
          if (isCorrect) cls = "border border-green-400 bg-green-50";
          else if (isUserWrong) cls = "border border-red-400 bg-red-50";
          return (
            <div
              key={o}
              className={"flex items-center gap-2 px-3 py-2 rounded-lg " + cls}
            >
              <span
                className={
                  "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 " +
                  (isCorrect
                    ? "bg-green-500 text-white"
                    : isUserWrong
                    ? "bg-red-500 text-white"
                    : "bg-purple-100 text-purple-600")
                }
              >
                {isCorrect ? "✓" : isUserWrong ? "✕" : labels[o]}
              </span>
              <span className="text-sm text-gray-800">{opt}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-500">
          中
        </span>
        <span className="text-gray-700">{q.zh}</span>
        <span className="font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-500 ml-2">
          EN
        </span>
        <span className="text-gray-600">{q.en}</span>
        <span className="font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-600 ml-2">
          FR
        </span>
        <span className="text-gray-600 italic">{q.fr}</span>
      </div>
    </div>
  );
}
