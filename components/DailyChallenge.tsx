"use client";

import { useMemo, useRef, useState } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { MathQuestionCard } from "@/components/MathQuestionCard";
import { KeypadInput } from "@/components/KeypadInput";
import { SpellingAttempt } from "@/components/SpellingBoard";
import { Mascot } from "@/components/Mascot";
import { Confetti, useConfetti } from "@/components/Confetti";
import { PopIn, StarReveal } from "@/components/celebrate";
import { cancelSpeech, configureSpeech, playSfx, speak } from "@/lib/audioManager";
import { mulberry32, seedFromString } from "@/lib/mathGenerator";
import { logicToChoiceQuestion } from "@/lib/logicEngine";
import {
  dailyItemToQuizQuestion,
  generateDailyChallenge,
  isDailyCorrect,
  type DailyAnswer,
  type DailyItem,
} from "@/lib/dailyChallenge";
import { getLevelConfig } from "@/lib/levels";
import {
  addPoints,
  settleLevelStars,
  starsForAccuracy,
  todayStr,
  type StudySession,
} from "@/lib/workspace";
import type { AlphabetCard, Word } from "@/lib/contentTypes";
import type { Sentence } from "@/lib/parser";

/**
 * 每日挑战（PRD §7.10.7，Dev-Plan T3.4）：
 * 跨学科混合卷（配比 = levels.ts dailyMix）→ 逐题作答 → 一次性结算：
 * 积分（+10，≥80% 再 +5）+ 星星（daily_<date> 结算，重开不重复计星）
 * + 吉祥物喂养 +1 + session 入统一错题本体系。
 * 出卷以「日期 + 学段」为种子 → 同日重复进入不出新卷（幂等）。
 */
export function DailyChallenge({
  pool,
  words,
  alphabets,
}: {
  pool: Sentence[];
  words: Word[];
  alphabets: AlphabetCard[];
}) {
  const { state, update } = useAppState();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<DailyAnswer[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [summary, setSummary] = useState<{
    acc: number;
    correct: number;
    stars: number;
    gained: number;
  } | null>(null);
  // 即时反馈（P-4：答对 ≤300ms 动效+音效；答错不打叉，引导重试）
  const [feedback, setFeedback] = useState<null | "correct" | "wrong">(null);
  const feedbackTimer = useRef<number | null>(null);
  const confetti = useConfetti();

  const level = state?.profile.level ?? "L3";
  const cfg = getLevelConfig(level);
  const today = todayStr();
  const speechRate = state?.settings.speechRate ?? 0.9;

  // 同日同卷：日期 + 学段为种子（misspelled 变化会注入拼词题，但不改变其他题）
  const items = useMemo<DailyItem[]>(
    () =>
      state
        ? generateDailyChallenge({
            level,
            date: today,
            pool,
            words,
            alphabets,
            misspelled: state.misspelled,
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state !== null, level, today, pool, words, alphabets]
  );

  const doneToday = !!state?.taskFlags[`daily_${today}`];

  function openChallenge() {
    configureSpeech(speechRate);
    setIndex(0);
    setAnswers(items.map(() => ({})));
    setRevealed(false);
    setSummary(null);
    setFeedback(null);
    setOpen(true);
  }

  function record(patch: DailyAnswer) {
    setAnswers((a) => a.map((v, i) => (i === index ? { ...v, ...patch } : v)));
    // 即时判定 → 音效 + 反馈（拼词题由 onSpell 分支处理）
    if (item && item.mode !== "spell") {
      const merged = { ...(answers[index] ?? {}), ...patch };
      const ok = isDailyCorrect(item, merged);
      flashFeedback(ok);
    }
  }

  function flashFeedback(ok: boolean) {
    playSfx(ok ? "correct" : "encourage");
    setFeedback(ok ? "correct" : "wrong");
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 1200);
  }

  function onSpellResult(ok: boolean) {
    record({ correct: ok });
    flashFeedback(ok);
  }

  function next() {
    setRevealed(false);
    if (index + 1 < items.length) {
      setIndex(index + 1);
      return;
    }
    submit();
  }

  function submit() {
    if (!state) return;
    const rng = mulberry32(seedFromString(`daily_settle_${today}`));
    const questions = items.map((it, i) =>
      dailyItemToQuizQuestion(it, answers[i] ?? {}, rng)
    );
    const correct = items.filter((it, i) => isDailyCorrect(it, answers[i] ?? {})).length;
    const acc = items.length ? Math.round((correct / items.length) * 100) : 0;
    const stars = starsForAccuracy(acc);
    const settled = settleLevelStars(state.rewards, `daily_${today}`, stars);

    const session: StudySession = {
      id: `s_daily_${today}`,
      date: today,
      durationMin: 8,
      contentRef: { type: "mixed", title: `每日挑战 · ${today}` },
      quiz: { title: `每日挑战 · ${today}`, questions },
      reviewed: false,
      subject: "language", // 每题自带 subject，错题本按题归组
    };
    let points = addPoints(state.points, 10, "完成每日挑战");
    if (acc >= 80) points = addPoints(points, 5, "每日挑战高正确率");

    update((s) => ({
      ...s,
      sessions: [...s.sessions.filter((x) => x.id !== session.id), session],
      points,
      rewards: settled.rewards,
      mascot: { ...s.mascot, fedCount: s.mascot.fedCount + 1 },
      taskFlags: { ...s.taskFlags, [`daily_${today}`]: today },
    }));
    setSummary({ acc, correct, stars, gained: settled.gained });
    // 关卡通关：levelup 音效 + 撒花（触发矩阵同步触发，PRD §7.3）
    playSfx("levelup");
    confetti.fire();
  }

  const item = items[index];
  const answer = answers[index];
  const answered =
    !!item &&
    (item.mode === "spell"
      ? answer?.correct !== undefined
      : item.mode === "lang"
      ? answer?.choice != null
      : answer?.text != null && answer.text !== "");

  function playFr(text: string) {
    cancelSpeech();
    void speak(text, "fr");
  }

  return (
    <div className="rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold">每日挑战</div>
          <div className="text-xs opacity-90 mt-1">
            {cfg.dailyQuizCount} 题 · 语言 {cfg.dailyMix.language} / 数学{" "}
            {cfg.dailyMix.math} / 逻辑 {cfg.dailyMix.logic}
          </div>
        </div>
        <span className="text-2xl" aria-hidden>
          {doneToday ? "✅" : "🎯"}
        </span>
      </div>

      {doneToday ? (
        <div className="mt-3 text-xs bg-white/25 rounded-full px-3 py-1.5 inline-block">
          今日已完成，明天继续加油！
        </div>
      ) : (
        <button
          className="mt-3 w-full min-h-[44px] rounded-xl bg-white text-purple-600 font-bold text-sm hover:bg-purple-50 transition"
          onClick={openChallenge}
          disabled={items.length === 0}
        >
          {items.length === 0 ? "内容准备中…" : "开始挑战"}
        </button>
      )}

      {open && item && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-gray-800/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !summary) setOpen(false);
          }}
        >
          <Confetti active={confetti.active && !!summary} />
          <PopIn className="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-gray-800">
            {summary ? (
              <div className="text-center py-6">
                <Mascot mood="happy" size={110} className="mx-auto" />
                <h2 className="text-xl font-bold mt-2">每日挑战完成！</h2>
                <div className="mt-4 flex justify-center">
                  <StarReveal stars={summary.stars} />
                </div>
                <p className="text-sm text-gray-500 mt-3">
                  答对 {summary.correct} / {items.length} · 正确率 {summary.acc}%
                  {summary.gained > 0 && ` · 本日获得 ${summary.gained} 颗星`}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  积分 +{10 + (summary.acc >= 80 ? 5 : 0)} · Félix 被投喂了 1 次
                </p>
                <button
                  className="btn-primary mt-6 min-w-[160px]"
                  onClick={() => setOpen(false)}
                >
                  完成
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-lg font-bold">🎯 每日挑战</div>
                  <button
                    className="w-9 h-9 rounded-full bg-purple-50 text-purple-600 text-lg shrink-0"
                    onClick={() => setOpen(false)}
                    aria-label="关闭"
                  >
                    ×
                  </button>
                </div>
                <div className="h-1.5 rounded-full bg-purple-50 overflow-hidden mb-4">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                    style={{ width: `${(index / items.length) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  第 {index + 1} / {items.length} 题 ·{" "}
                  {item.subject === "language"
                    ? "语言"
                    : item.subject === "math"
                    ? "数学"
                    : "逻辑"}
                </p>
                <DailyItemView
                  item={item}
                  answer={answer ?? {}}
                  revealed={revealed}
                  onReveal={() => setRevealed(true)}
                  onChoice={(c) => record({ choice: c })}
                  onText={(t) => record({ text: t })}
                  onSpell={onSpellResult}
                  onPlay={playFr}
                />
                {/* 即时反馈行（P-4：答对即时动效+音效；答错不打叉，Félix 鼓励） */}
                <div className="min-h-[40px] flex items-center justify-center mt-3">
                  {feedback === "correct" && (
                    <span className="animate-[feedback-pop_0.3s_ease] text-green-600 font-bold">
                      ✅ 答对啦，真棒！
                    </span>
                  )}
                  {feedback === "wrong" && (
                    <span className="flex items-center gap-2 text-orange-500 font-semibold text-sm">
                      <Mascot mood="encourage" size={36} />
                      再想想，Félix 相信你！
                    </span>
                  )}
                </div>
                <button
                  className="btn-primary w-full mt-2 min-h-[48px]"
                  disabled={!answered}
                  onClick={next}
                >
                  {index + 1 < items.length
                    ? answered
                      ? "下一题"
                      : "请先作答"
                    : answered
                    ? "提交并结算"
                    : "请先作答"}
                </button>
              </>
            )}
          </PopIn>
        </div>
      )}
    </div>
  );
}

/** 单题渲染（依 mode 分派；数学 keypad 直接用 KeypadInput，拼写复用 SpellingAttempt） */
function DailyItemView({
  item,
  answer,
  revealed,
  onReveal,
  onChoice,
  onText,
  onSpell,
  onPlay,
}: {
  item: DailyItem;
  answer: DailyAnswer;
  revealed: boolean;
  onReveal: () => void;
  onChoice: (c: number) => void;
  onText: (t: string) => void;
  onSpell: (correct: boolean) => void;
  onPlay: (text: string) => void;
}) {
  const [keypad, setKeypad] = useState("");

  if (item.mode === "spell") {
    return (
      <div>
        <p className="text-xs text-gray-400 mb-2">把单词拼出来（点选字母瓦片）</p>
        <SpellingAttempt word={item.word} compact onResult={onSpell} />
      </div>
    );
  }

  if (item.mode === "math") {
    const q = item.q;
    return (
      <div className="space-y-3">
        <MathQuestionCard q={q} />
        {q.inputMode === "choice" && q.options?.length ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              {q.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => onText(opt)}
                  aria-pressed={answer.text === opt}
                  className={
                    "min-h-[56px] rounded-xl border-2 text-2xl font-bold tabular-nums transition " +
                    (answer.text === opt
                      ? "border-purple-500 bg-purple-50 text-purple-700"
                      : "border-gray-100 bg-white text-gray-700 hover:border-purple-200")
                  }
                >
                  {opt}
                </button>
              ))}
            </div>
          </>
        ) : (
          <KeypadInput
            value={keypad}
            onChange={(v) => {
              setKeypad(v);
              onText(v);
            }}
            onSubmit={() => {}}
          />
        )}
      </div>
    );
  }

  if (item.mode === "logic") {
    const options = logicToChoiceQuestion(item.q)?.options ?? [item.q.answer];
    return (
      <div className="space-y-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
          <p className="text-base text-gray-800 font-semibold">{item.q.stem.zh}</p>
          {item.q.kind === "pattern" && (
            <p className="text-2xl mt-2 tracking-widest">
              {(item.q.payload as { items?: string[] }).items?.join("  ")}
            </p>
          )}
          {item.q.kind === "oddOne" && (
            <p className="text-xs text-gray-400 mt-1">找出不属于同类的一个</p>
          )}
        </div>
        <div className="space-y-1.5">
          {options.map((opt, o) => (
            <div
              key={o}
              onClick={() => onText(opt)}
              className={
                "flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer border text-2xl " +
                (answer.text === opt
                  ? "border-purple-400 bg-purple-100"
                  : "border-purple-100 bg-white hover:bg-purple-50")
              }
            >
              <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold shrink-0">
                {o + 1}
              </span>
              <span>{opt}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // language: choice / listen
  const q = item.q;
  const isListen = q.mode === "listen";
  return (
    <div className="space-y-3">
      <div className="bg-purple-50 rounded-xl p-3 text-sm">
        {isListen ? (
          <div className="flex items-center gap-2">
            <button
              className="w-10 h-10 rounded-full bg-purple-600 text-white shrink-0"
              onClick={() => onPlay(q.fr)}
              aria-label="播放法语"
            >
              ▶
            </button>
            {revealed ? (
              <span className="italic">« {q.fr} » 是什么意思？</span>
            ) : (
              <button className="text-xs text-purple-600 underline" onClick={onReveal}>
                显示原文
              </button>
            )}
          </div>
        ) : (
          <span className="italic">« {q.fr} » 是什么意思？</span>
        )}
      </div>
      <div className="space-y-1.5">
        {q.options.map((opt, o) => (
          <div
            key={o}
            onClick={() => onChoice(o)}
            className={
              "flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer border " +
              (answer.choice === o
                ? "border-purple-400 bg-purple-100"
                : "border-purple-100 bg-white hover:bg-purple-50")
            }
          >
            <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold shrink-0">
              {["A", "B", "C", "D"][o]}
            </span>
            <span className="text-sm text-gray-800">{opt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
