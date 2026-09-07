"use client";

import type { SpeechScore } from "@/lib/pronunciation";
import type { QuizQuestion, SpeakLang } from "@/lib/workspace";

/** 跟读打分单题卡片（从 WorkspaceView 拆分，逻辑未改动） */
export function SpeakQuizCard({
  index,
  total,
  recognizedCount,
  q,
  result,
  recState,
  onPlay,
  onRecognize,
  submitted,
}: {
  index: number;
  total: number;
  recognizedCount: number;
  q: QuizQuestion;
  result: SpeechScore | null;
  recState: "idle" | "recording" | "denied" | "unsupported" | "error";
  onPlay: (text: string, lang?: SpeakLang) => void;
  onRecognize: (i: number) => void;
  submitted: boolean;
}) {
  const langLabel = q.targetLang === "en" ? "EN" : "FR";
  const langColor = q.targetLang === "en" ? "blue" : "green";
  const isRecording = recState === "recording" && !submitted;
  const scoreColor =
    result == null
      ? "text-gray-400"
      : result.score >= 80
      ? "text-green-600"
      : result.score >= 60
      ? "text-yellow-600"
      : "text-red-600";

  return (
    <div className="bg-purple-50 rounded-xl p-3">
      {/* 题号 + 进度 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
            {index + 1}
          </span>
          <span className="text-xs text-gray-500">
            {recognizedCount}/{total} 已识别
          </span>
        </div>
        {result != null && (
          <span className={`text-lg font-extrabold ${scoreColor}`}>
            {result.score}
            <span className="text-xs font-normal text-gray-500 ml-0.5">分</span>
          </span>
        )}
      </div>

      {/* 目标句 */}
      <div className="text-sm font-semibold text-gray-800 mb-1">
        <span
          className={`font-bold px-1.5 py-0.5 rounded bg-${langColor}-50 text-${langColor}-600 mr-2`}
        >
          {langLabel}
        </span>
        {q.targetText}
      </div>

      {/* 翻译 */}
      {q.targetLang === "fr" ? (
        <div className="text-xs text-gray-500 italic mb-2">「{q.zh}」</div>
      ) : (
        <div className="text-xs text-gray-500 italic mb-2">{q.fr}</div>
      )}

      {/* 播放原音 */}
      <div className="flex items-center gap-2 mb-2">
        <button
          className="w-8 h-8 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center shrink-0"
          onClick={() => onPlay(q.targetText ?? "", q.targetLang)}
          disabled={isRecording}
          title="播放原音"
        >
          {isRecording ? "◼" : "▶"}
        </button>
        <button
          className={`flex-1 text-sm py-2 rounded-full font-medium transition ${
            isRecording
              ? "bg-red-500 text-white animate-pulse"
              : "bg-purple-100 text-purple-700 hover:bg-purple-200"
          }`}
          onClick={() => onRecognize(index)}
          disabled={isRecording}
        >
          {isRecording
            ? "● 正在录音…"
            : result == null
            ? "🎤 开始录音"
            : "🔄 重新录音"}
        </button>
      </div>

      {/* 识别结果 */}
      {result != null && result.transcript && (
        <div className="text-xs text-gray-600 mb-1">
          <span className="font-semibold">识别：</span>
          「{result.transcript}」
        </div>
      )}

      {/* 评分与反馈 */}
      {result != null && (
        <div className="text-xs text-gray-600 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold">匹配词：</span>
            {result.matched.length > 0 ? (
              result.matched.map((w) => (
                <span
                  key={w}
                  className="px-1.5 py-0.5 rounded bg-green-100 text-green-700"
                >
                  {w}
                </span>
              ))
            ) : (
              <span className="text-gray-400">（无）</span>
            )}
          </div>
          {result.missing.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-semibold">漏读：</span>
              {result.missing.map((w) => (
                <span
                  key={w}
                  className="px-1.5 py-0.5 rounded bg-red-100 text-red-600"
                >
                  {w}
                </span>
              ))}
            </div>
          )}
          {result.extra.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-semibold">多读：</span>
              {result.extra.map((w) => (
                <span
                  key={w}
                  className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700"
                >
                  {w}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <span className="font-semibold">建议：</span>
            {result.feedback.slice(0, 2).map((tip) => (
              <span key={tip} className="text-gray-500">
                · {tip}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
