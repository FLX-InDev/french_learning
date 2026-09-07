"use client";

import type { SpeechScore } from "@/lib/pronunciation";
import type { QuizMode, QuizQuestion, SpeakLang } from "@/lib/workspace";
import { SpeakQuizCard } from "./SpeakQuizCard";

/**
 * 自主测验弹窗内容（选择 / 听力 / 跟读三模式）。
 * 从 WorkspaceView 拆分，逻辑未改动；
 * 跟读相关 props 为必传——曾因可选而漏传导致 BUG-1，此处保留编译期拦截。
 */
export function LiveQuizModal({
  mode,
  questions,
  answers,
  submitted,
  revealed,
  audioState,
  recState,
  recMsg,
  speakResults,
  title,
  onPlay,
  onAnswer,
  onToggleReveal,
  onSubmit,
  onRecognize,
  onClose,
}: {
  mode: QuizMode;
  questions: QuizQuestion[];
  answers: (number | null)[];
  submitted: boolean;
  revealed: Set<number>;
  audioState: "idle" | "playing" | "unsupported";
  recState: "idle" | "recording" | "denied" | "unsupported" | "error";
  recMsg: string;
  speakResults: (SpeechScore | null)[];
  title?: string;
  onPlay: (text: string, lang?: SpeakLang) => void;
  onAnswer: (i: number, o: number) => void;
  onToggleReveal: (i: number) => void;
  onSubmit: () => void;
  onRecognize: (i: number) => void;
  onClose: () => void;
}) {
  const labels = ["A", "B", "C", "D"];
  const isSpeak = mode === "speak";
  // 跟读题：提交条件是全部识别完毕（无 null）
  const allAnswered = isSpeak
    ? speakResults.every((r) => r !== null)
    : answers.every((a) => a !== null);
  // 已识别题数
  const recognizedCount = isSpeak
    ? speakResults.filter((r) => r !== null).length
    : 0;
  const score = questions.filter((q, i) => answers[i] === q.correctIndex).length;
  const acc = questions.length ? Math.round((score / questions.length) * 100) : 0;
  const earned = 10 + (acc >= 80 ? 5 : 0);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-lg font-bold text-gray-800">
            {title ??
              (mode === "listen"
                ? "🔊 听力小测验"
                : mode === "speak"
                ? "🎤 跟读打分"
                : "🎯 选择题小测验")}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            共 {questions.length} 题 · 从真实学习内容出题
          </div>
        </div>
        <button
          className="w-9 h-9 rounded-full bg-purple-50 text-purple-600 text-lg shrink-0"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {submitted ? (
        <div className="bg-purple-50 rounded-xl p-4 mb-4 text-center">
          {isSpeak ? (
            <>
              <div className="text-2xl font-extrabold text-purple-600">
                {Math.round(
                  (questions
                    .filter((q) => q.score != null)
                    .reduce((s, q) => s + (q.score ?? 0), 0) /
                    (questions.length || 1))
                )}
                / 100
              </div>
              <div className="text-xs text-gray-500">平均发音得分</div>
              <div className="text-sm font-bold text-pink-500 mt-1">
                获得积分 +15
              </div>
              <div className="text-xs text-gray-500 mt-1">
                已记录到「今日学习成果」，可在下方点评。
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-extrabold text-purple-600">
                {score} / {questions.length}
              </div>
              <div className="text-xs text-gray-500">
                答对题数 · 正确率 {acc}%
              </div>
              <div className="text-sm font-bold text-pink-500 mt-1">
                获得积分 +{earned}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                已记录到「今日学习成果」，可在下方点评。
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="bg-purple-50 rounded-xl p-3 mb-4 text-sm text-gray-600">
          {isSpeak ? (
            <>
              播放原音，然后点击「录音」跟读。系统会对发音打分并给建议。
              {recState === "recording" && (
                <span className="ml-2 text-red-500 animate-pulse">
                  ● 正在录音…
                </span>
              )}
              {recState === "denied" && (
                <span className="ml-2 text-red-500">（麦克风权限被拒绝）</span>
              )}
              {recState === "unsupported" && (
                <span className="ml-2 text-red-500">
                  （浏览器不支持语音识别，请使用 Chrome/Edge）
                </span>
              )}
              {recMsg && <span className="ml-2 text-red-500">{recMsg}</span>}
            </>
          ) : mode === "listen" ? (
            <>
              点击 ▶ 听法语发音，选出正确中文意思；答题后可「显示原文」对照。
              {audioState === "unsupported" && (
                <span className="text-purple-600">
                  （当前浏览器不支持语音合成，可点「显示原文」对照）
                </span>
              )}
            </>
          ) : (
            "选出法语句子的正确中文意思。"
          )}
        </div>
      )}

      <div className="space-y-3">
        {questions.map((q, i) => {
          if (isSpeak) {
            const result = speakResults[i] ?? null;
            return (
              <SpeakQuizCard
                key={i}
                index={i}
                total={questions.length}
                recognizedCount={recognizedCount}
                q={q}
                result={result}
                recState={recState}
                onPlay={onPlay}
                onRecognize={onRecognize}
                submitted={submitted}
              />
            );
          }
          const hidden = mode === "listen" && !revealed.has(i) && !submitted;
          return (
            <div key={i} className="bg-purple-50 rounded-xl p-3">
              <div className="font-semibold text-sm text-gray-800 mb-2 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs shrink-0">
                  {i + 1}
                </span>
                {mode === "listen" && (
                  <button
                    className="shrink-0 w-8 h-8 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center"
                    onClick={() => onPlay(q.fr)}
                    title="播放法语"
                  >
                    {audioState === "playing" ? "◼" : "▶"}
                  </button>
                )}
                {hidden ? (
                  <button
                    className="text-xs text-purple-600 underline"
                    onClick={() => onToggleReveal(i)}
                  >
                    显示原文
                  </button>
                ) : (
                  <span className="italic">« {q.fr} » 是什么意思？</span>
                )}
              </div>
              <div className="space-y-1.5">
                {q.options.map((opt, o) => {
                  const isCorrect = o === q.correctIndex;
                  const isUserWrong = answers[i] === o && o !== q.correctIndex;
                  const isSelected = answers[i] === o;
                  let cls = "border border-purple-100 bg-white";
                  if (submitted) {
                    if (isCorrect) cls = "border border-green-400 bg-green-50";
                    else if (isUserWrong)
                      cls = "border border-red-400 bg-red-50";
                  } else if (isSelected) {
                    cls = "border border-purple-400 bg-purple-100";
                  }
                  const badgeCls =
                    "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 " +
                    (submitted
                      ? isCorrect
                        ? "bg-green-500 text-white"
                        : isUserWrong
                        ? "bg-red-500 text-white"
                        : "bg-purple-100 text-purple-600"
                      : isSelected
                      ? "bg-purple-500 text-white"
                      : "bg-purple-100 text-purple-600");
                  const badgeText = submitted
                    ? isCorrect
                      ? "✓"
                      : isUserWrong
                      ? "✕"
                      : labels[o]
                    : labels[o];
                  return (
                    <div
                      key={o}
                      onClick={() => onAnswer(i, o)}
                      className={
                        "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer " +
                        cls
                      }
                    >
                      <span className={badgeCls}>{badgeText}</span>
                      <span className="text-sm text-gray-800">{opt}</span>
                    </div>
                  );
                })}
              </div>
              {submitted && (
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
              )}
            </div>
          );
        })}
      </div>

      {!submitted ? (
        <button
          className="btn-primary w-full mt-4"
          disabled={!allAnswered}
          onClick={onSubmit}
        >
          {allAnswered ? "提交并结算积分" : "请答完所有题目"}
        </button>
      ) : (
        <button className="btn-primary w-full mt-4" onClick={onClose}>
          完成
        </button>
      )}
    </div>
  );
}
