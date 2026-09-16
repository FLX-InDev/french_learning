"use client";

/**
 * 口算限时赛主玩法（Phase 6 T6-04 / S3，PRD §7.7.9，F28）
 *
 * - 时长三选 60/90/120 秒，初值取学段 `timeLimitSec`（DG-4 ✅ 2026-09-16）；
 * - 出题复用 §9.5 生成器（`stageKindsForLevel` 按学段抽 kind，验收 ④）；
 * - combo 连对加分（纯函数 `nextRaceProgress`，验收 ③⑤）；
 * - 倒计时双通道：数字 + 进度条（验收 ⑧）；操作目标 ≥ 48px（验收 ⑨）；
 * - 结算自动落榜（`raceStore` 独立 key，验收 ②⑥⑦）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "@/components/AppStateProvider";
import {
  generateMathQuestion,
  mulberry32,
  normalizeAnswer,
  type MathQuestion,
} from "@/lib/mathGenerator";
import { stageKindsForLevel } from "@/lib/mathCurriculum";
import { getLevelConfig, type Level } from "@/lib/levels";
import {
  INITIAL_RACE_PROGRESS,
  RACE_DURATIONS,
  defaultRaceDuration,
  nextRaceProgress,
  raceDateStr,
  type RaceDuration,
  type RaceProgress,
  type RaceRecord,
} from "@/lib/race";
import { addRaceRecord, loadRaceRecords } from "@/lib/raceStore";
import { KeypadInput } from "@/components/KeypadInput";
import { MathQuestionCard } from "@/components/MathQuestionCard";
import { RaceBoard } from "./RaceBoard";

type Phase = "idle" | "running" | "done";

const FEEDBACK_OK_MS = 300;
const FEEDBACK_NO_MS = 900;

export function RaceGame() {
  const { t } = useI18n();
  const { state } = useAppState();

  if (!state) {
    return (
      <div className="py-20 text-center text-gray-400">
        {t("workspace.loading")}
      </div>
    );
  }

  return <RaceGameInner level={state.profile.level} />;
}

function RaceGameInner({ level }: { level: Level }) {
  const { t } = useI18n();
  const cfg = getLevelConfig(level);
  const recommended = defaultRaceDuration(level); // DG-4：初值取学段

  const [phase, setPhase] = useState<Phase>("idle");
  const [duration, setDuration] = useState<RaceDuration>(recommended);
  const [progress, setProgress] = useState<RaceProgress>(INITIAL_RACE_PROGRESS);
  const [question, setQuestion] = useState<MathQuestion | null>(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<null | "ok" | "no">(null);
  const [remainingSec, setRemainingSec] = useState<number>(recommended);
  const [records, setRecords] = useState<RaceRecord[]>([]);

  // 计分真源走 ref（settle 闭包稳定，倒计时 effect 不因作答而重启）
  const progressRef = useRef<RaceProgress>(INITIAL_RACE_PROGRESS);
  // 初始种子取确定值（render 期不调用 Date.now）；startRace 时再注入熵
  const rngRef = useRef(mulberry32(1));
  const indexRef = useRef(0);
  const settledRef = useRef(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const kinds = useMemo(() => stageKindsForLevel(level), [level]);

  // 挂载后读榜（SSR 安全：raceStore 内部已判 window）
  useEffect(() => {
    setRecords(loadRaceRecords());
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const makeQuestion = useCallback((): MathQuestion => {
    const kind =
      kinds.length > 0 ? kinds[Math.floor(rngRef.current() * kinds.length)] : "add";
    return generateMathQuestion({
      level,
      kind,
      rng: rngRef.current,
      seedTag: "race",
      index: indexRef.current++,
    });
  }, [kinds, level]);

  /** 到点结算（验收 ②）：落榜 + 切结算屏 */
  const settle = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    const p = progressRef.current;
    const record: RaceRecord = {
      score: p.score,
      correct: p.correct,
      bestCombo: p.bestCombo,
      durationSec: duration,
      level,
      date: raceDateStr(),
    };
    setPhase("done");
    setRecords(addRaceRecord(record));
  }, [duration, level]);

  // 倒计时：以 deadline 绝对时间计算，避免 interval 漂移；到点自动结算
  useEffect(() => {
    if (phase !== "running") return;
    const deadline = Date.now() + duration * 1000;
    const id = setInterval(() => {
      const left = deadline - Date.now();
      setRemainingSec(Math.max(0, Math.ceil(left / 1000)));
      if (left <= 0) {
        clearInterval(id);
        settle();
      }
    }, 200);
    return () => clearInterval(id);
  }, [phase, duration, settle]);

  function startRace() {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    rngRef.current = mulberry32(
      (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0
    );
    indexRef.current = 0;
    settledRef.current = false;
    progressRef.current = INITIAL_RACE_PROGRESS;
    setProgress(INITIAL_RACE_PROGRESS);
    setInput("");
    setFeedback(null);
    setRemainingSec(duration);
    setQuestion(makeQuestion());
    setPhase("running");
  }

  function submitAnswer(ans: string) {
    if (phase !== "running" || feedback || !question) return;
    const ok = normalizeAnswer(ans) === normalizeAnswer(question.answer);
    const next = nextRaceProgress(progressRef.current, ok);
    progressRef.current = next;
    setProgress(next);
    setFeedback(ok ? "ok" : "no");
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(
      () => {
        const nextQ = makeQuestion();
        setFeedback(null);
        setInput("");
        setQuestion(nextQ);
      },
      ok ? FEEDBACK_OK_MS : FEEDBACK_NO_MS
    );
  }

  const timeLow = phase === "running" && remainingSec <= 10;

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-8">
      {/* 标题 */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800">
          <span className="text-orange-500">⏱️</span> {t("race.title")}
        </h1>
        {phase === "idle" && (
          <p className="text-gray-500 mt-2 text-sm">{t("race.subtitle")}</p>
        )}
      </div>

      {/* ── idle：选时长 + 榜单 ─────────────────────────────── */}
      {phase === "idle" && (
        <>
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm font-semibold text-gray-600 mb-3">
              {t("race.durationLabel")}
            </p>
            <div className="grid grid-cols-3 gap-3">
              {RACE_DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  aria-pressed={duration === d}
                  className={
                    "rounded-xl border-2 p-3 min-h-[64px] transition relative " +
                    (duration === d
                      ? "border-orange-400 bg-orange-50"
                      : "border-gray-100 bg-white hover:border-orange-200")
                  }
                >
                  {d === recommended && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded-full bg-orange-500 text-white whitespace-nowrap">
                      {t("race.recommended")}
                    </span>
                  )}
                  <span className="block text-lg font-extrabold text-gray-800 tabular-nums">
                    {t("race.durationOption", { n: String(d) })}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={startRace}
              className="btn-primary w-full mt-4 min-h-[52px] text-lg"
            >
              🚀 {t("race.start")}
            </button>
            <p className="text-xs text-gray-400 mt-3 text-center">
              {cfg.emoji} {cfg.id} · {cfg.cnName} / {cfg.frName}
            </p>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3">
              🏆 {t("race.boardTitle")}
            </h2>
            <RaceBoard records={records} />
          </section>
        </>
      )}

      {/* ── running：计时 + 题目 + 作答 ─────────────────────── */}
      {phase === "running" && question && (
        <>
          {/* 状态条：得分 / combo / 剩余时间（数字 + 进度条双通道） */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold text-gray-700">
                {t("race.score")}:{" "}
                <span className="text-xl font-extrabold text-purple-600 tabular-nums">
                  {progress.score}
                </span>
              </span>
              {progress.combo >= 2 && (
                <span
                  className="font-bold text-orange-500"
                  aria-live="polite"
                  data-testid="race-combo"
                >
                  🔥 {t("race.combo", { n: String(progress.combo) })}
                </span>
              )}
              <span
                className={
                  "font-extrabold tabular-nums " +
                  (timeLow ? "text-red-500 text-xl" : "text-gray-700")
                }
                aria-live="off"
              >
                {t("race.timeLeft", { n: String(remainingSec) })}
              </span>
            </div>
            <div
              className="h-3 rounded-full bg-gray-100 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={remainingSec}
            >
              <div
                className={
                  "h-full transition-all duration-200 " +
                  (timeLow ? "bg-red-400" : "bg-purple-500")
                }
                style={{ width: `${(remainingSec / duration) * 100}%` }}
              />
            </div>
          </div>

          {/* 题目 */}
          <MathQuestionCard q={question} />

          {/* 作答反馈 */}
          <div aria-live="assertive" className="text-center min-h-[32px]">
            {feedback === "ok" && (
              <span className="inline-block px-4 py-1 rounded-full bg-green-100 text-green-700 font-bold">
                {t("race.feedbackOk")}
              </span>
            )}
            {feedback === "no" && (
              <span className="inline-block px-4 py-1 rounded-full bg-red-100 text-red-600 font-bold">
                {t("race.feedbackNo", { answer: question.answer })}
              </span>
            )}
          </div>

          {/* 输入：choice 选项 / 数字键盘 */}
          {question.inputMode === "choice" && question.options ? (
            <div className="grid grid-cols-2 gap-3">
              {question.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={!!feedback}
                  onClick={() => submitAnswer(opt)}
                  className="rounded-xl border-2 border-purple-100 bg-white hover:border-purple-400 hover:shadow-sm min-h-[56px] text-xl font-extrabold text-gray-800 transition"
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <KeypadInput
              value={input}
              onChange={setInput}
              onSubmit={() => submitAnswer(input)}
              disabled={!!feedback}
            />
          )}
        </>
      )}

      {/* ── done：结算 + 榜单 ────────────────────────────────── */}
      {phase === "done" && (
        <>
          <section className="bg-white rounded-2xl shadow-sm border-2 border-orange-200 p-6 text-center">
            <div className="text-4xl mb-2">🏁</div>
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {t("race.resultTitle")}
            </h2>
            <div className="text-5xl font-extrabold text-purple-600 tabular-nums mb-4">
              {progress.score}
            </div>
            <div className="flex justify-center gap-6 text-sm text-gray-600">
              <span>
                {t("race.resultCorrect")}:{" "}
                <b className="text-gray-800">{progress.correct}</b>
              </span>
              <span>
                {t("race.resultBestCombo")}:{" "}
                <b className="text-gray-800">×{progress.bestCombo}</b>
              </span>
              <span>
                {t("race.durationOption", { n: String(duration) })}
              </span>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={startRace}
                className="btn-primary flex-1 min-h-[48px]"
              >
                🔄 {t("race.playAgain")}
              </button>
              <Link
                href="/math"
                className="flex-1 inline-flex items-center justify-center rounded-xl border-2 border-gray-200 text-gray-600 font-bold min-h-[48px] hover:border-gray-400 transition"
              >
                {t("race.backToMap")}
              </Link>
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3">
              🏆 {t("race.boardTitle")}
            </h2>
            <RaceBoard records={records} />
          </section>
        </>
      )}
    </div>
  );
}
