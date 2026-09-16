"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "./AppStateProvider";
import { MathQuestionCard, DecompositionSteps } from "./MathQuestionCard";
import { KeypadInput } from "./KeypadInput";
import { Mascot } from "./Mascot";
import { Confetti, useConfetti } from "./Confetti";
import { StarReveal } from "./celebrate";
import { playSfx } from "@/lib/audioManager";
import { findStage } from "@/lib/mathCurriculum";
import {
  generateMathQuiz,
  normalizeAnswer,
  toQuizQuestion,
  type ArithVisual,
  type MathQuestion,
} from "@/lib/mathGenerator";
import {
  addPoints,
  sessionDurationMin,
  settleLevelStars,
  starsForAccuracy,
  todayStr,
  type StudySession,
} from "@/lib/workspace";
import type { MathItem } from "@/lib/contentTypes";

/**
 * 数学关卡页（PRD §7.7 核心流程）：
 * 出卷（生成器 + 固定题混合，同日同卷）→ 逐题作答（choice / keypad）→
 * 凑十/破十分解可展开 → 星级结算（≥90 三星 / ≥70 两星 / 完成一星，重刷不重复计星）→
 * session（subject: "math"）入统一错题本体系。
 */
export function MathQuiz({
  stageId,
  fixedItems,
}: {
  stageId: string;
  fixedItems: MathItem[];
}) {
  const { t } = useI18n();
  const { state, update } = useAppState();
  const found = findStage(stageId);
  const level = state?.profile.level ?? "L3";

  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [choice, setChoice] = useState<string | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [answers, setAnswers] = useState<(string | null)[]>([]);
  const [finished, setFinished] = useState<null | { stars: number; gained: number; acc: number }>(null);
  const [showDecomp, setShowDecomp] = useState(false);
  // 真实计时（F52/BUG-3）：关卡开始时间戳
  const startedAtRef = useRef(Date.now());
  // 答错引导：短暂显示正确答案后再进入下一题（P-4：不打叉，用引导代替）
  const [wrongHint, setWrongHint] = useState<string | null>(null);
  const confetti = useConfetti();

  // 重刷时重置计时起点（finished 回到 null 即新一轮）
  useEffect(() => {
    if (!finished) startedAtRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished === null]);

  // 通关：levelup 音效 + 撒花（触发矩阵同步）
  useEffect(() => {
    if (finished) {
      playSfx("levelup");
      confetti.fire();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished !== null]);

  const questions = useMemo<MathQuestion[]>(() => {
    if (!found) return [];
    return generateMathQuiz({
      level: found.level,
      kind: found.stage.kind,
      count: found.stage.count,
      seed: `${stageId}_${todayStr()}`,
      fixedFactor: found.stage.fixedFactor,
      fixedItems,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId, level]);

  if (!state) {
    return <div className="py-20 text-center text-gray-400">{t("math.loading")}</div>;
  }
  const st = state;

  if (!found) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">{t("math.levelNotFound")}</p>
        <Link href="/math" className="btn-primary mt-4 inline-block">
          {t("math.backToMap")}
        </Link>
      </div>
    );
  }

  if (found.level !== level) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">
          {t("math.levelLocked", { level: found.level })}
        </p>
        <Link href="/math" className="btn-primary mt-4 inline-block">
          {t("math.backToMap")}
        </Link>
      </div>
    );
  }

  const q = questions[index];
  const { group, stage } = found;

  function submit() {
    if (!q) return;
    const userAnswer = q.inputMode === "choice" ? choice : input;
    const correct =
      userAnswer !== null && normalizeAnswer(userAnswer) === normalizeAnswer(q.answer);
    const nextResults = [...results, correct];
    const nextAnswers = [...answers, userAnswer];
    setResults(nextResults);
    setAnswers(nextAnswers);
    setInput("");
    setChoice(null);
    setShowDecomp(false);

    // 即时反馈（P-4）：答对 ✅ 短停；答错音效 + 显示正确答案引导后再进入下一题
    const advance = () => {
      if (index + 1 < questions.length) {
        setIndex(index + 1);
      } else {
        // ── 结算 ──
        const acc = Math.round(
          (nextResults.filter(Boolean).length / questions.length) * 100
        );
        const stars = starsForAccuracy(acc);
        const settled = settleLevelStars(st.rewards, stageId, stars);
        const today = todayStr();

        // session（subject: math）：错题进统一错题本
        const session: StudySession = {
          id: `s_math_${stageId}_${today}`,
          date: today,
          durationMin: sessionDurationMin(startedAtRef.current),
          contentRef: { type: "mixed", title: `数学 · ${group.title.zh} · ${stage.title.zh}` },
          quiz: {
            title: `${stage.title.zh} · ${today}`,
            questions: questions.map((mq, i) =>
              toQuizQuestion(mq, { userAnswer: nextAnswers[i] })
            ),
          },
          reviewed: false,
          subject: "math",
        };

        let points = addPoints(st.points, 10, `完成数学关卡 ${stage.title.zh}`);
        if (acc >= 80) points = addPoints(points, 5, "数学高正确率奖励");

        update((s) => ({
          ...s,
          rewards: settled.rewards,
          points,
          sessions: [...s.sessions.filter((x) => x.id !== session.id), session],
        }));
        setFinished({ stars, gained: settled.gained, acc });
      }
    };
    if (correct) {
      playSfx("correct");
      window.setTimeout(advance, 420);
    } else {
      playSfx("encourage");
      setWrongHint(q.answer);
      window.setTimeout(() => {
        setWrongHint(null);
        advance();
      }, 1100);
    }
  }

  const decomp = (() => {
    const v = q?.visual as ArithVisual | undefined;
    return v && "decomposition" in v ? v.decomposition : undefined;
  })();

  if (finished) {
    return (
      <div className="max-w-xl mx-auto text-center py-10">
        <Confetti active={confetti.active} />
        <Mascot mood="happy" size={120} className="mx-auto" />
        <h1 className="text-2xl font-bold text-gray-800 mt-2">
          {t("math.completed", { stage: stage.title.zh })}
        </h1>
        <div className="mt-4 flex justify-center">
          <StarReveal stars={finished.stars} />
        </div>
        <p className="text-sm text-gray-500 mt-3">
          正确率 {finished.acc}% · 本关获得 {finished.gained} 颗星（累计{" "}
          {state.rewards.stars}）
        </p>
        {finished.gained === 0 && finished.stars < 3 && (
          <p className="text-xs text-gray-400 mt-1">
            {t("math.resultHint")}
          </p>
        )}
        <div className="flex gap-3 justify-center mt-6">
          <button
            className="btn-secondary"
            onClick={() => {
              setFinished(null);
              setIndex(0);
              setResults([]);
              setAnswers([]);
              setInput("");
              setChoice(null);
            }}
          >
            {t("math.retry")}
          </button>
          <Link href="/math" className="btn-primary">
            {t("math.backToMap")}
          </Link>
        </div>
      </div>
    );
  }

  if (!q) {
    return <div className="py-20 text-center text-gray-400">{t("math.loading")}</div>;
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/math" className="text-sm text-purple-500">
          {t("math.backArrow")}
        </Link>
        <span className="text-sm text-gray-400">
          {index + 1} / {questions.length}
        </span>
      </div>

      <div className="text-center">
        <h1 className="font-bold text-gray-800">
          {t("math.title", { group: group.title.zh, stage: stage.title.zh })}
        </h1>
        <p className="text-[11px] text-gray-400 mt-1">
          {t("math.chinaProgress", { progress: group.cnProgress, benchmark: group.frBenchmark })}
        </p>
      </div>

      <div className="h-1.5 rounded-full bg-purple-50 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
          style={{ width: `${(index / questions.length) * 100}%` }}
        />
      </div>

      <MathQuestionCard q={q} />

      {q.inputMode === "choice" ? (
        <div className="grid grid-cols-2 gap-3">
          {(q.options ?? []).map((opt) => (
            <button
              key={opt}
              onClick={() => setChoice(opt)}
              aria-pressed={choice === opt}
              className={
                "min-h-[56px] rounded-xl border-2 text-2xl font-bold tabular-nums transition " +
                (choice === opt
                  ? "border-purple-500 bg-purple-50 text-purple-700"
                  : "border-gray-100 bg-white text-gray-700 hover:border-purple-200")
              }
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <KeypadInput value={input} onChange={setInput} onSubmit={submit} />
      )}

      {q.inputMode === "choice" && (
        <button
          className="btn-primary w-full min-h-[48px]"
          onClick={submit}
          disabled={!choice || wrongHint !== null}
        >
          {t("math.confirm")}
        </button>
      )}

      {/* 答错引导（P-4：不打叉，显示正确答案后进入下一题） */}
      {wrongHint !== null && (
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-center text-sm text-orange-600 font-semibold">
          {t("math.correctAnswer", { answer: wrongHint })}
        </div>
      )}

      {decomp && (
        <>
          <button
            className="w-full text-sm text-purple-500 py-2"
            onClick={() => setShowDecomp((v) => !v)}
          >
            {showDecomp ? t("math.collapseSteps") : t("math.showSteps")}
          </button>
          {showDecomp && <DecompositionSteps steps={decomp} />}
        </>
      )}
    </div>
  );
}
