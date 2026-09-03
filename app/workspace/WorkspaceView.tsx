"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Sentence, Story } from "@/lib/parser";
import {
  buildSeed,
  buildPool,
  shuffle,
  generateQuiz,
  REWARDS,
  type QuizMode,
  type QuizQuestion,
  type StudySession,
  type WorkspaceState,
} from "@/lib/workspace";

const PREFIX = "wb_frws_";

function fmt(d: Date) {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}
function todayStr() {
  return fmt(new Date());
}
function mdLabel(s: string) {
  const p = s.split("-");
  return p[1] + "月" + p[2] + "日";
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function quizResult(s: StudySession) {
  const qs = s.quiz.questions;
  let c = 0;
  for (const q of qs) if (q.userIndex === q.correctIndex) c++;
  return {
    score: c,
    total: qs.length,
    acc: qs.length ? Math.round((c / qs.length) * 100) : 0,
  };
}
function accColor(a: number) {
  return a >= 80 ? "#16A34A" : a >= 60 ? "#D97706" : "#EF4444";
}
function computeStreak(checkins: string[]) {
  let d = new Date();
  if (!checkins.includes(todayStr())) d = addDays(d, -1);
  let s = 0;
  while (checkins.includes(fmt(d))) {
    s++;
    d = addDays(d, -1);
  }
  return s;
}
function computeLongestStreak(checkins: string[]) {
  if (checkins.length === 0) return 0;
  const uniq = checkins
    .filter((c, i) => checkins.indexOf(c) === i)
    .sort();
  let best = 1;
  let cur = 1;
  let prev: string | null = null;
  for (const ds of uniq) {
    if (prev) {
      const diff = Math.round(
        (new Date(ds).getTime() - new Date(prev).getTime()) / 86400000
      );
      cur = diff === 1 ? cur + 1 : 1;
      best = Math.max(best, cur);
    }
    prev = ds;
  }
  return best;
}

export default function WorkspaceView({
  stories,
  sentences,
}: {
  stories: Story[];
  sentences: Sentence[];
}) {
  const [ws, setWs] = useState<WorkspaceState | null>(null);
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [pool] = useState(() => buildPool(stories, sentences));
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveMode, setLiveMode] = useState<QuizMode>("choice");
  const [liveQuestions, setLiveQuestions] = useState<QuizQuestion[]>([]);
  const [liveAnswers, setLiveAnswers] = useState<(number | null)[]>([]);
  const [liveSubmitted, setLiveSubmitted] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [audioState, setAudioState] = useState<
    "idle" | "playing" | "unsupported"
  >("idle");
  const [liveReview, setLiveReview] = useState(false);

  // 初始化：优先读 localStorage，否则用真实内容造示例
  useEffect(() => {
    let loaded: WorkspaceState | null = null;
    try {
      const raw = localStorage.getItem(PREFIX + "state");
      if (raw) loaded = JSON.parse(raw);
    } catch {}
    if (!loaded) {
      loaded = buildSeed(stories, sentences);
      try {
        localStorage.setItem(PREFIX + "state", JSON.stringify(loaded));
      } catch {}
    }
    setWs(loaded);
  }, [stories, sentences]);

  function persist(next: WorkspaceState) {
    setWs(next);
    try {
      localStorage.setItem(PREFIX + "state", JSON.stringify(next));
    } catch {}
  }
  function addPoints(
    p: WorkspaceState["points"],
    delta: number,
    reason: string
  ) {
    return {
      total: p.total + delta,
      history: [...p.history, { date: todayStr(), delta, reason }],
    };
  }

  function doCheckin() {
    if (!ws) return;
    const t = todayStr();
    if (ws.checkins.includes(t)) return;
    persist({
      ...ws,
      checkins: [...ws.checkins, t],
      points: addPoints(ws.points, 10, "每日打卡"),
    });
  }
  function redeem(id: string) {
    if (!ws) return;
    const r = REWARDS.find((x) => x.id === id);
    if (!r || ws.points.total < r.cost) return;
    persist({
      ...ws,
      points: {
        total: ws.points.total - r.cost,
        history: [
          ...ws.points.history,
          { date: todayStr(), delta: -r.cost, reason: "兑换 " + r.name },
        ],
      },
      redeemed: [...ws.redeemed, { id: r.id, date: todayStr(), cost: r.cost }],
    });
  }
  function markReviewed(id: string) {
    if (!ws) return;
    const sessions = ws.sessions.map((s) =>
      s.id === id ? { ...s, reviewed: true } : s
    );
    persist({ ...ws, sessions, points: addPoints(ws.points, 5, "测验点评") });
  }
  function exportJson() {
    if (!ws) return;
    const blob = new Blob([JSON.stringify(ws, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "french-workspace-backup.json";
    a.click();
  }
  function importJson(file: File) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result as string);
        if (d.sessions && d.checkins && d.points)
          persist({
            sessions: d.sessions,
            checkins: d.checkins,
            points: d.points,
            redeemed: d.redeemed || [],
          });
      } catch {}
    };
    rd.readAsText(file);
  }
  function clearAll() {
    if (!confirm("确定清空全部学习数据？此操作不可撤销。")) return;
    const seed = buildSeed(stories, sentences);
    try {
      localStorage.removeItem(PREFIX + "state");
    } catch {}
    persist(seed);
  }

  // 浏览器内置语音合成（无需服务端，离线可用）
  function playFr(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setAudioState("unsupported");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.rate = 0.9;
    u.onend = () => setAudioState("idle");
    u.onerror = () => setAudioState("idle");
    setAudioState("playing");
    window.speechSynthesis.speak(u);
  }
  function startLiveQuiz() {
    const qs = generateQuiz(pool, 4, liveMode);
    setLiveQuestions(qs);
    setLiveAnswers(qs.map(() => null));
    setRevealed(new Set());
    setLiveSubmitted(false);
    setLiveReview(false);
    setLiveOpen(true);
  }
  function startReview() {
    if (mistakes.length === 0) return;
    const qs = shuffle(mistakes.map((m) => ({ ...m.q, userIndex: null }))).slice(
      0,
      6
    );
    setLiveQuestions(qs);
    setLiveAnswers(qs.map(() => null));
    setRevealed(new Set());
    setLiveSubmitted(false);
    setLiveMode("choice");
    setLiveReview(true);
    setLiveOpen(true);
  }
  function answerLive(i: number, o: number) {
    if (liveSubmitted) return;
    setLiveAnswers((a) => a.map((v, idx) => (idx === i ? o : v)));
  }
  function toggleReveal(i: number) {
    setRevealed((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }
  function submitLive() {
    if (!ws) return;
    if (liveAnswers.some((a) => a === null)) return;
    const answered = liveQuestions.map((q, i) => ({
      ...q,
      userIndex: liveAnswers[i] as number,
    }));
    const score = answered.filter(
      (q) => q.userIndex === q.correctIndex
    ).length;
    const acc = Math.round((score / answered.length) * 100);
    const t = todayStr();
    const kind = liveReview
      ? "错题复习"
      : liveMode === "listen"
      ? "听力"
      : "选择";
    const crTitle = liveReview
      ? "错题复习"
      : liveMode === "listen"
      ? "听力小测验"
      : "选择题小测验";
    const newSession: StudySession = {
      id: "s_live_" + t,
      date: t,
      durationMin: 8,
      contentRef: {
        type: "mixed",
        title: crTitle,
      },
      quiz: {
        title: kind + " · " + t,
        questions: answered,
      },
      reviewed: false,
    };
    let pts = addPoints(ws.points, 10, "完成新测验");
    if (acc >= 80) pts = addPoints(pts, 5, "高正确率奖励");
    const sessions = [...ws.sessions.filter((s) => s.date !== t), newSession];
    persist({ ...ws, sessions, points: pts });
    setLiveSubmitted(true);
  }

  // Esc 关闭弹窗
  useEffect(() => {
    if (!activeQuizId) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveQuizId(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [activeQuizId]);

  if (!ws) {
    return <div className="py-20 text-center text-gray-400">加载中…</div>;
  }

  const t = todayStr();
  const todaySession = ws.sessions.find((s) => s.date === t) || null;
  const activeQuiz = activeQuizId
    ? ws.sessions.find((s) => s.id === activeQuizId) || null
    : null;

  // 学习统计
  const stats = (() => {
    const totalMin = ws.sessions.reduce((a, s) => a + s.durationMin, 0);
    const quizCount = ws.sessions.reduce(
      (a, s) => a + s.quiz.questions.length,
      0
    );
    const accs = ws.sessions.map((s) => quizResult(s).acc);
    const avgAcc = accs.length
      ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length)
      : 0;
    const practiced = new Set<string>();
    ws.sessions.forEach((s) =>
      s.quiz.questions.forEach((q) => practiced.add(q.fr))
    );
    const coverage = pool.length
      ? Math.min(100, Math.round((practiced.size / pool.length) * 100))
      : 0;
    return {
      totalMin,
      quizCount,
      avgAcc,
      practicedCount: practiced.size,
      coverage,
    };
  })();
  const last7 = Array.from({ length: 7 }).map((_, i) => {
    const d = addDays(new Date(), -(6 - i));
    const ds = fmt(d);
    const sess = ws.sessions.find((s) => s.date === ds);
    return { ds, min: sess ? sess.durationMin : 0, label: String(d.getDate()) };
  });
  const maxMin = Math.max(10, ...last7.map((x) => x.min));
  const mistakes: { q: QuizQuestion; title: string }[] = [];
  ws.sessions.forEach((s) =>
    s.quiz.questions.forEach((q) => {
      if (q.userIndex !== null && q.userIndex !== q.correctIndex)
        mistakes.push({ q, title: s.contentRef.title });
    })
  );

  // 今天要处理
  const tasks: {
    overdue: boolean;
    title: string;
    sub: string;
    pill: string;
    act: string;
    fn: () => void;
  }[] = [];
  if (!ws.checkins.includes(t))
    tasks.push({
      overdue: false,
      title: "今日打卡未完成",
      sub: "连续打卡可获得积分奖励",
      pill: "今日",
      act: "去打卡",
      fn: doCheckin,
    });
  for (const s of ws.sessions) {
    if (!s.reviewed && s.date < t)
      tasks.push({
        overdue: true,
        title: mdLabel(s.date) + " 的测验未点评",
        sub: s.contentRef.title,
        pill: "逾期",
        act: "去点评",
        fn: () => setActiveQuizId(s.id),
      });
  }
  if (!todaySession)
    tasks.push({
      overdue: false,
      title: "今日学习尚未开始",
      sub: "完成一节约儿法语，自动记录成果",
      pill: "建议",
      act: "去学习",
      fn: () => {},
    });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 今天要处理 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2">
          ⏰ 今天要处理
        </h2>
        {tasks.length === 0 ? (
          <div className="text-center text-gray-400 py-3">
            今天都搞定啦 🎉 保持节奏，明天继续！
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task, i) => (
              <div
                key={i}
                className={
                  "flex items-center gap-3 p-3 rounded-xl " +
                  (task.overdue
                    ? "bg-red-50 border border-red-100"
                    : "bg-purple-50")
                }
              >
                <div className="flex-1 min-w-0">
                  <div
                    className={
                      "font-semibold text-sm " +
                      (task.overdue ? "text-red-600" : "text-gray-800")
                    }
                  >
                    {task.title}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {task.sub}
                  </div>
                </div>
                <span
                  className={
                    "text-xs px-2 py-0.5 rounded-full shrink-0 " +
                    (task.overdue
                      ? "bg-red-100 text-red-600"
                      : "bg-white text-purple-600")
                  }
                >
                  {task.pill}
                </span>
                <button className="btn-pill shrink-0" onClick={task.fn}>
                  {task.act}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 今日学习成果 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2">
          📊 今日学习成果
        </h2>
        {!todaySession ? (
          <div className="text-center text-gray-400 py-6">
            <div className="text-3xl mb-2">🌱</div>
            今天还没有学习记录
            <br />
            <span className="text-sm">
              完成学习后，这里会显示时长、内容与测验点评。
            </span>
            <div className="mt-4">
              <Link href="/stories" className="btn-primary">
                去学一个故事
              </Link>
            </div>
          </div>
        ) : (
          <TodayResult
            session={todaySession}
            onOpen={() => setActiveQuizId(todaySession.id)}
          />
        )}
        <div className="mt-4 pt-4 border-t border-dashed border-gray-100">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">
            历史学习记录
          </h3>
          <div className="space-y-2">
            {ws.sessions
              .filter((s) => s.date !== t)
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .slice(0, 5)
              .map((s) => {
                const r = quizResult(s);
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 py-2 border-b border-gray-50"
                  >
                    <span className="text-xs text-gray-400 w-[60px] shrink-0">
                      {mdLabel(s.date)}
                    </span>
                    <span className="flex-1 text-sm font-semibold text-gray-800 truncate">
                      {s.contentRef.title}
                    </span>
                    <span className="text-sm font-bold text-purple-600 w-[44px] text-right">
                      {r.acc}%
                    </span>
                    <button
                      className={
                        "text-xs px-3 py-1.5 rounded-full font-medium shrink-0 " +
                        (s.reviewed
                          ? "bg-green-50 text-green-600"
                          : "bg-purple-50 text-purple-600")
                      }
                      onClick={() => setActiveQuizId(s.id)}
                    >
                      {s.reviewed ? "已点评" : "点评"}
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      </section>

      {/* 自主测验 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
          🎯 自主测验
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          从真实学习内容随机出题，巩固今日所学。完成后自动记录到「今日学习成果」并奖励积分。
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-sm text-gray-500">题型：</span>
          <button
            className={
              "text-sm px-4 py-2 rounded-full font-medium transition " +
              (liveMode === "choice"
                ? "bg-purple-600 text-white"
                : "bg-purple-50 text-purple-600")
            }
            onClick={() => setLiveMode("choice")}
          >
            选择题（法→中）
          </button>
          <button
            className={
              "text-sm px-4 py-2 rounded-full font-medium transition " +
              (liveMode === "listen"
                ? "bg-purple-600 text-white"
                : "bg-purple-50 text-purple-600")
            }
            onClick={() => setLiveMode("listen")}
          >
            🔊 听力题（听→选义）
          </button>
        </div>
        <button className="btn-primary" onClick={startLiveQuiz}>
          开始{liveMode === "listen" ? "听力" : "选择"}测验
        </button>
      </section>

      {/* 学习统计 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2">
          📈 学习统计
        </h2>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard label="累计学习时长" value={stats.totalMin + " 分钟"} />
          <StatCard label="累计测验题数" value={stats.quizCount + " 题"} />
          <StatCard label="平均正确率" value={stats.avgAcc + "%"} />
          <StatCard
            label="已练句子"
            value={stats.practicedCount + " / " + pool.length}
          />
        </div>
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>内容覆盖度</span>
            <span>{stats.coverage}%</span>
          </div>
          <div className="h-2 rounded-full bg-purple-50 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500"
              style={{ width: stats.coverage + "%" }}
            />
          </div>
        </div>
        <h3 className="text-sm font-semibold text-gray-500 mb-2">
          近 7 天学习时长
        </h3>
        <div className="flex items-end gap-2 h-24">
          {last7.map((d, i) => (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end gap-1"
            >
              <span className="text-[10px] text-gray-400">
                {d.min ? d.min : ""}
              </span>
              <div
                className="w-full rounded-md bg-purple-500"
                style={{ height: Math.max(4, (d.min / maxMin) * 80) + "px" }}
                title={d.ds + " · " + d.min + " 分钟"}
              />
              <span className="text-[10px] text-gray-400">{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 错题本 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2">
          📕 错题本
        </h2>
        {mistakes.length === 0 ? (
          <div className="text-center text-gray-400 py-3">
            暂无错题，保持得很好 🎉
          </div>
        ) : (
          <>
            <button className="btn-primary mb-3" onClick={startReview}>
              复习错题（{mistakes.length}）
            </button>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {mistakes.map((m, i) => (
                <div
                  key={i}
                  className="border border-gray-100 rounded-xl p-3"
                >
                  <div className="text-sm font-semibold text-gray-800 italic">
                    « {m.q.fr} »
                  </div>
                  <div className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <span className="text-red-500">
                      你的答案：{m.q.options[m.q.userIndex ?? 0]}
                    </span>
                    <span className="text-green-600">
                      正确答案：{m.q.options[m.q.correctIndex]}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {m.q.explanation}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 每日打卡 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2">
          ✅ 每日打卡
        </h2>
        <div className="flex items-center justify-between gap-3 mb-4">
          <button
            className="btn-primary min-w-[150px]"
            disabled={ws.checkins.includes(t)}
            onClick={doCheckin}
          >
            {ws.checkins.includes(t) ? "今日已打卡 ✓" : "今日打卡"}
          </button>
          <div className="flex gap-6">
            <div className="text-center">
              <div className="text-3xl font-extrabold text-purple-600 leading-none">
                {computeStreak(ws.checkins)}
              </div>
              <div className="text-xs text-gray-500 mt-1">当前连续</div>
            </div>
            <div className="text-center border-l border-gray-100 pl-6">
              <div className="text-3xl font-extrabold text-pink-500 leading-none">
                {computeLongestStreak(ws.checkins)}
              </div>
              <div className="text-xs text-gray-500 mt-1">最长连续</div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }).map((_, i) => {
            const d = addDays(new Date(), -(34 - i));
            const ds = fmt(d);
            const on = ws.checkins.includes(ds);
            const isToday = ds === t;
            return (
              <div
                key={i}
                title={ds + (on ? " · 已打卡" : "")}
                className={
                  "aspect-square rounded-md " +
                  (on ? "bg-purple-500" : "bg-purple-50") +
                  (isToday ? " ring-2 ring-pink-400" : "")
                }
              />
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-1.5 text-xs text-gray-400 mt-2">
          <span>未打卡</span>
          <span className="w-3 h-3 rounded-md bg-purple-50" />
          <span className="w-3 h-3 rounded-md bg-purple-500" />
          <span>已打卡</span>
        </div>
      </section>

      {/* 奖励积分 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2">
          🎁 奖励积分
        </h2>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-3xl font-extrabold text-pink-500">
            {ws.points.total}
          </span>
          <span className="text-sm text-gray-500">可用积分</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {REWARDS.map((r) => {
            const can = ws.points.total >= r.cost;
            return (
              <div
                key={r.id}
                className="border border-gray-100 rounded-xl p-3 flex flex-col gap-1.5"
              >
                <div className="text-2xl">{r.icon}</div>
                <div className="font-semibold text-sm text-gray-800">
                  {r.name}
                </div>
                <div className="text-xs font-bold text-pink-500">
                  {r.cost} 积分
                </div>
                <button
                  className="btn-primary mt-1"
                  disabled={!can}
                  onClick={() => redeem(r.id)}
                >
                  {can ? "兑换" : "积分不足"}
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-3 border-t border-dashed border-gray-100">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">
            最近积分记录
          </h3>
          <div className="space-y-1">
            {[...ws.points.history]
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .slice(0, 6)
              .map((h, i) => (
                <div
                  key={i}
                  className="flex justify-between text-xs text-gray-500"
                >
                  <span>
                    {mdLabel(h.date)} · {h.reason}
                  </span>
                  <span
                    className={
                      "font-bold " +
                      (h.delta >= 0 ? "text-green-600" : "text-purple-600")
                    }
                  >
                    {h.delta >= 0 ? "+" : "-"}
                    {Math.abs(h.delta)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* 数据备份 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
          💾 数据备份
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          本地数据保存在此浏览器。建议定期导出备份，换设备时通过「导入恢复」迁移。
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={exportJson}>
            导出 JSON 备份
          </button>
          <label className="btn-secondary cursor-pointer">
            导入恢复
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJson(f);
                e.target.value = "";
              }}
            />
          </label>
          <button className="btn-secondary" onClick={clearAll}>
            清空全部数据
          </button>
        </div>
      </section>

      {/* 测验点评弹窗 */}
      {activeQuiz && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-gray-800/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveQuizId(null);
          }}
        >
          <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <QuizModal
              session={activeQuiz}
              onClose={() => setActiveQuizId(null)}
              onReview={() => markReviewed(activeQuiz.id)}
            />
          </div>
        </div>
      )}
      {/* 自主测验弹窗 */}
      {liveOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-gray-800/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLiveOpen(false);
          }}
        >
          <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <LiveQuizModal
              mode={liveMode}
              questions={liveQuestions}
              answers={liveAnswers}
              submitted={liveSubmitted}
              revealed={revealed}
              audioState={audioState}
              title={liveReview ? "📕 错题复习" : undefined}
              onPlay={playFr}
              onAnswer={answerLive}
              onToggleReveal={toggleReveal}
              onSubmit={submitLive}
              onClose={() => setLiveOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 子组件 ───────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-100 rounded-xl p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-extrabold text-purple-600 mt-0.5">
        {value}
      </div>
    </div>
  );
}

function TodayResult({
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

function QuizModal({
  session,
  onClose,
  onReview,
}: {
  session: StudySession;
  onClose: () => void;
  onReview: () => void;
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
          <QuestionCard key={i} q={q} index={i} />
        ))}
      </div>
    </div>
  );
}

function QuestionCard({ q, index }: { q: QuizQuestion; index: number }) {
  const labels = ["A", "B", "C", "D"];
  return (
    <div className="bg-purple-50 rounded-xl p-3">
      <div className="font-semibold text-sm text-gray-800 mb-2 flex gap-2">
        <span className="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs shrink-0">
          {index + 1}
        </span>
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

function LiveQuizModal({
  mode,
  questions,
  answers,
  submitted,
  revealed,
  audioState,
  title,
  onPlay,
  onAnswer,
  onToggleReveal,
  onSubmit,
  onClose,
}: {
  mode: QuizMode;
  questions: QuizQuestion[];
  answers: (number | null)[];
  submitted: boolean;
  revealed: Set<number>;
  audioState: "idle" | "playing" | "unsupported";
  title?: string;
  onPlay: (text: string) => void;
  onAnswer: (i: number, o: number) => void;
  onToggleReveal: (i: number) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const labels = ["A", "B", "C", "D"];
  const score = questions.filter((q, i) => answers[i] === q.correctIndex).length;
  const acc = questions.length ? Math.round((score / questions.length) * 100) : 0;
  const allAnswered = answers.every((a) => a !== null);
  const earned = 10 + (acc >= 80 ? 5 : 0);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-lg font-bold text-gray-800">
            {title ??
              (mode === "listen" ? "🔊 听力小测验" : "🎯 选择题小测验")}
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
        </div>
      ) : (
        <div className="bg-purple-50 rounded-xl p-3 mb-4 text-sm text-gray-600">
          {mode === "listen" ? (
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
