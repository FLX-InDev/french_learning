"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Sentence, Story } from "@/lib/parser";
import {
  NORMAL_SPEECH_RATE,
  VOICE_CONFIG,
  playbackRate,
  utteranceRate,
} from "@/lib/voiceConfig";
import {
  scorePronunciation,
  type Candidate,
  type SpeechScore,
} from "@/lib/pronunciation";
import {
  getSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
} from "@/lib/speechRecognition";
import {
  addDays,
  addPoints,
  buildPool,
  computeLongestStreak,
  computeStreak,
  createInitialState,
  exportBackup,
  fmt,
  generateQuiz,
  generateSpeakQuiz,
  importBackup,
  mdLabel,
  quizResult,
  sessionDurationMin,
  shuffle,
  todayStr,
  REWARDS,
  SUBJECT_LABEL_KEYS,
  type AppState,
  type QuizMode,
  type QuizQuestion,
  type SpeakLang,
  type StudySession,
} from "@/lib/workspace";
import { isPronunciationPass, type Subject } from "@/lib/levels";
import {
  generateMathQuestion,
  mulberry32,
  seedFromString,
  toChoiceQuizQuestion,
  type MathKind,
} from "@/lib/mathGenerator";
import {
  generateLogicQuestion,
  logicToChoiceQuestion,
  toQuizQuestion as logicToQuizQuestion,
  type LogicKind,
} from "@/lib/logicEngine";
import { useAppState } from "@/components/AppStateProvider";
import { useI18n, localizedHref } from "@/lib/i18n";
// ── 拆分出的展示组件（见 components/workspace/）──
import { LiveQuizModal } from "@/components/workspace/LiveQuizModal";
import { QuizModal } from "@/components/workspace/QuizModal";
import { StatCard } from "@/components/workspace/StatCard";
import { TodayResult } from "@/components/workspace/TodayResult";
import { MascotPen, BadgeWall, DailyQuestList } from "@/components/growth/GrowthView";
import { SubjectStats } from "@/components/growth/ProgressView";

export default function WorkspaceView({
  stories,
  sentences,
}: {
  stories: Story[];
  sentences: Sentence[];
}) {
  // 别名 tr：文件内 t 已被 todayStr() 占用（多处 const t = todayStr()）
  const { t: tr, locale } = useI18n();
  // 状态树 v2：由全局 AppStateProvider 提供（localStorage + 迁移 + 持久化）
  const { state: ws, update } = useAppState();
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
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  // ── 跟读打分 ──
  const [speakResults, setSpeakResults] = useState<(SpeechScore | null)[]>([]);
  const [recState, setRecState] = useState<
    "idle" | "recording" | "denied" | "unsupported" | "error"
  >("idle");
  const [recMsg, setRecMsg] = useState<string>("");
  const [asrSupported, setAsrSupported] = useState<boolean | null>(null);
  const [useTtsBackend, setUseTtsBackend] = useState(false);
  const [lastSpeakSummary, setLastSpeakSummary] = useState<{
    avg: number;
    passed: number;
    total: number;
  } | null>(null);
  const [liveReview, setLiveReview] = useState(false);
  // 真实计时（F52/BUG-3）：会话开始时间戳，提交时换算分钟
  const [liveStartedAt, setLiveStartedAt] = useState<number>(() => Date.now());
  // 错题本学科过滤（all / language / math / logic）
  const [mistakeFilter, setMistakeFilter] = useState<"all" | Subject>("all");
  // 全局语速：家长中心设置（0.75 慢速 / 0.9 正常），TTS 双轨同步生效
  const speechRate = ws?.settings.speechRate ?? NORMAL_SPEECH_RATE;

  // 能力检测：浏览器是否支持语音识别（决定跟读题型是否可用）
  useEffect(() => {
    setAsrSupported(isSpeechRecognitionSupported());
  }, []);

  // TTS 方案检测：read-aloud-sf 可用则走后端，否则回退浏览器内置语音
  useEffect(() => {
    fetch("/api/tts/config")
      .then((r) => r.json())
      .then((d) => {
        setUseTtsBackend(d.provider !== "webspeech" && !!d.available);
      })
      .catch(() => setUseTtsBackend(false));
  }, []);

  // 浏览器内置语音合成（read-aloud-sf 不可用时的回退）
  function speakWithWebSpeech(text: string, lang: SpeakLang) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setAudioState("unsupported");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = VOICE_CONFIG[lang].lang;
    u.rate = utteranceRate(lang, speechRate);
    u.onend = () => setAudioState("idle");
    u.onerror = () => setAudioState("idle");
    setAudioState("playing");
    window.speechSynthesis.speak(u);
  }

  /** 写入全局状态树（由 Provider 统一持久化） */
  function persist(next: AppState) {
    update(() => next);
  }
  function doCheckin() {
    if (!ws) return;
    const t = todayStr();
    if (ws.checkins.includes(t)) return;
    persist({
      ...ws,
      checkins: [...ws.checkins, t],
      points: addPoints(ws.points, 10, tr("workspace.checkin")),
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
          {
            date: todayStr(),
            delta: -r.cost,
            reason: tr("workspace.redeem") + tr(r.nameKey),
          },
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
    persist({ ...ws, sessions, points: addPoints(ws.points, 5, tr("workspace.quizReview")) });
  }
  /** 导出 v2 备份（含 profile / 星星 / 养成 / 设置，F16 升级）*/
  function exportJson() {
    if (!ws) return;
    const blob = new Blob([exportBackup(ws)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "french-learning-backup-v2.json";
    a.click();
  }
  /** 导入：同时接受 v1 与 v2 备份；失败不破坏现有状态 */
  function importJson(file: File) {
    const rd = new FileReader();
    rd.onload = () => {
      const next = importBackup(String(rd.result ?? ""));
      if (!next) {
        alert(tr("workspace.importBadFormat"));
        return;
      }
      persist(next);
    };
    rd.readAsText(file);
  }
  function clearAll() {
    if (!confirm(tr("workspace.confirmClear"))) return;
    persist(createInitialState(ws?.profile.level ?? "L3"));
  }

  // 播放原音：优先走 read-aloud-sf 后端（经 /api/tts 代理），
  // 后端不可用或请求失败时回退浏览器内置语音合成。
  // voice 用 Cloudflare 神经语音（fr-FR-DeniseNeural / en-US-JennyNeural）
  async function playText(text: string, lang: SpeakLang = "fr") {
    // 先停掉上一段尚未结束的音频，避免叠加
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }

    if (!useTtsBackend) {
      speakWithWebSpeech(text, lang);
      return;
    }

    setAudioState("playing");
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice: VOICE_CONFIG[lang].cfVoice,
          rate: speechRate,
        }),
      });
      if (!res.ok) {
        console.error("[playText] read-aloud 请求失败，回退浏览器语音:", res.status);
        speakWithWebSpeech(text, lang);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = playbackRate(speechRate);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioElRef.current = null;
        setAudioState("idle");
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        audioElRef.current = null;
        setAudioState("idle");
      };
      audioElRef.current = audio;
      await audio.play();
    } catch (err) {
      console.error("[playText] read-aloud 调用出错，回退浏览器语音:", err);
      speakWithWebSpeech(text, lang);
    }
  }

  /** 法语播放（选择题/听力题/点评卡片沿用） */
  function playFr(text: string) {
    return playText(text, "fr");
  }
  function startLiveQuiz() {
    setLiveStartedAt(Date.now());
    if (liveMode === "speak") {
      if (!asrSupported) return;
      const qs = generateSpeakQuiz(pool, 4);
      setLiveQuestions(qs);
      setLiveAnswers(qs.map(() => null));
      setSpeakResults(qs.map(() => null));
      setRevealed(new Set());
      setLiveSubmitted(false);
      setLiveReview(false);
      setRecState("idle");
      setRecMsg("");
      setLiveOpen(true);
      return;
    }
    const qs = generateQuiz(pool, 4, liveMode);
    setLiveQuestions(qs);
    setLiveAnswers(qs.map(() => null));
    setSpeakResults([]);
    setRevealed(new Set());
    setLiveSubmitted(false);
    setLiveReview(false);
    setLiveOpen(true);
  }
  function startReview() {
    if (visibleMistakes.length === 0) return;
    setLiveStartedAt(Date.now());
    const lvl = ws?.profile.level ?? "L3";
    const t = todayStr();

    // ── 数学错题：同知识点重生成全新题目（PRD §7.10.8「防背答案」）──
    if (mistakeFilter === "math") {
      const rng = mulberry32(seedFromString(`review_math_${t}`));
      const kinds = Array.from(
        new Set(
          visibleMistakes
            .map((m) => m.q.kind)
            .filter((k): k is string => !!k)
        )
      );
      const useKinds = kinds.length > 0 ? kinds : (["add"] as string[]);
      const qs = useKinds.slice(0, 6).map((kind, i) => {
        const mq = generateMathQuestion({
          level: lvl,
          kind: kind as MathKind,
          rng,
          seedTag: `review_${t}`,
          index: i,
        });
        return toChoiceQuizQuestion(mq, rng);
      });
      setLiveQuestions(qs);
      setLiveAnswers(qs.map(() => null));
      setSpeakResults([]);
      setRevealed(new Set());
      setLiveSubmitted(false);
      setLiveMode("choice");
      setLiveReview(true);
      setLiveOpen(true);
      return;
    }

    // ── 逻辑错题：同能力域/题型重生成（pattern/oddOne 带候选；其余单选项重放）──
    if (mistakeFilter === "logic") {
      const rng = mulberry32(seedFromString(`review_logic_${t}`));
      const kinds = Array.from(
        new Set(
          visibleMistakes
            .map((m) => m.q.kind)
            .filter((k): k is LogicKind => !!k)
        )
      );
      const useKinds = kinds.length > 0 ? kinds : (["pattern"] as LogicKind[]);
      const qs = useKinds.slice(0, 6).map((kind) => {
        const lq = generateLogicQuestion({ level: lvl, kind, rng });
        return logicToChoiceQuestion(lq) ?? logicToQuizQuestion(lq, false);
      });
      setLiveQuestions(qs);
      setLiveAnswers(qs.map(() => null));
      setSpeakResults([]);
      setRevealed(new Set());
      setLiveSubmitted(false);
      setLiveMode("choice");
      setLiveReview(true);
      setLiveOpen(true);
      return;
    }

    // ── 语言 / 全部：按既有错题重放 ──
    const qs = shuffle(
      visibleMistakes.map((m) => ({ ...m.q, userIndex: null }))
    ).slice(0, 6);
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
      ? tr("workspace.mistakeReview")
      : liveMode === "listen"
      ? tr("workspace.quizTypeListening")
      : tr("workspace.quizTypeChoice");
    const crTitle = liveReview
      ? tr("workspace.mistakeReview")
      : liveMode === "listen"
      ? tr("workspace.quizTypeListening2")
      : tr("workspace.quizTypeChoice2");
    const newSession: StudySession = {
      id: "s_live_" + t,
      date: t,
      durationMin: sessionDurationMin(liveStartedAt),
      contentRef: {
        type: "mixed",
        title: crTitle,
      },
      quiz: {
        title: kind + " · " + t,
        questions: answered,
      },
      reviewed: false,
      subject: "language",
    };
    let pts = addPoints(ws.points, 10, tr("workspace.rewardNewQuiz"));
    if (acc >= 80) pts = addPoints(pts, 5, tr("workspace.rewardHighAccuracy"));
    // 按 id 去重（而非按日期），避免同一天的不同类型测验互相覆盖
    const sessions = [
      ...ws.sessions.filter((s) => s.id !== newSession.id),
      newSession,
    ];
    persist({ ...ws, sessions, points: pts });
    setLiveSubmitted(true);
  }

  // ── 跟读打分：录音并按词级比对得出分数与建议 ──
  function recognize(i: number) {
    const q = liveQuestions[i];
    if (!q || !q.targetLang || !q.targetText) return;

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setRecState("unsupported");
      setRecMsg(tr("workspace.speechNotSupported"));
      return;
    }

    const rec = new Ctor();
    rec.lang = q.targetLang === "fr" ? "fr-FR" : "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 5;

    setRecState("recording");
    setRecMsg("");

    rec.onresult = (event) => {
      const cands: Candidate[] = [];
      for (let r = 0; r < event.results.length; r++) {
        const res = event.results[r];
        if (!res.isFinal) continue;
        for (let a = 0; a < res.length; a++) {
          cands.push({
            transcript: res[a].transcript,
            confidence: res[a].confidence,
          });
        }
      }

      const result = scorePronunciation(
        q.targetText as string,
        cands,
        q.targetLang as SpeakLang
      );

      setSpeakResults((prev) =>
        prev.map((v, idx) => (idx === i ? result : v))
      );
      // 回填题目：及格记 correctIndex（视为通过），不及格记 null（不进错题本）
      setLiveQuestions((prev) =>
        prev.map((qq, idx) =>
          idx === i
            ? {
                ...qq,
                score: result.score,
                transcript: result.transcript,
                feedback: result.feedback,
                // BUG-4：及格线按当前学段读取（L1 为 null → 不评分，恒定通过）
                userIndex: isPronunciationPass(result.score, ws?.profile.level)
                  ? qq.correctIndex
                  : null,
              }
            : qq
        )
      );
      setRecState("idle");
    };

    rec.onerror = (event) => {
      const code = event.error;
      if (code === "not-allowed" || code === "service-not-allowed") {
        setRecState("denied");
        setRecMsg(tr("workspace.microphoneDenied"));
      } else if (code === "network") {
        setRecState("error");
        setRecMsg(tr("workspace.asrNetwork"));
      } else if (code === "no-speech") {
        setRecState("error");
        setRecMsg(tr("workspace.asrNoSpeech"));
      } else {
        setRecState("error");
        setRecMsg(tr("workspace.asrFailed", { code: code || tr("workspace.asrUnknown") }));
      }
    };

    rec.onend = () => {
      setRecState((s) => (s === "recording" ? "idle" : s));
    };

    try {
      rec.start();
    } catch {
      setRecState("error");
      setRecMsg(tr("workspace.asrStartFailed"));
    }
  }

  function submitSpeak() {
    if (!ws) return;
    if (speakResults.some((r) => r === null)) return;
    const scores = speakResults.map((r) => (r ? r.score : 0));
    const avg = Math.round(
      scores.reduce((s, n) => s + n, 0) / (scores.length || 1)
    );
    const passed = scores.filter((s) =>
      isPronunciationPass(s, ws.profile.level)
    ).length;
    const t = todayStr();

    const newSession: StudySession = {
      id: "s_live_" + t + "_speak",
      date: t,
      durationMin: sessionDurationMin(liveStartedAt),
      contentRef: { type: "mixed", title: tr("workspace.readingQuiz") },
      quiz: {
        title: tr("workspace.readingShort") + " · " + t,
        questions: liveQuestions,
      },
      reviewed: false,
      subject: "language",
    };
    let pts = addPoints(ws.points, 10, tr("workspace.readingQuizComplete"));
    if (avg >= 80) pts = addPoints(pts, 5, tr("workspace.rewardGoodPronunciation"));
    const sessions = [
      ...ws.sessions.filter((s) => s.id !== newSession.id),
      newSession,
    ];
    persist({ ...ws, sessions, points: pts });
    setLiveSubmitted(true);
    setLastSpeakSummary({ avg, passed, total: scores.length });
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
    return (
      <div className="py-20 text-center text-gray-400">
        {tr("workspace.loading")}
      </div>
    );
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
  const mistakes: {
    q: QuizQuestion;
    title: string;
    subject: Subject;
  }[] = [];
  ws.sessions.forEach((s) =>
    s.quiz.questions.forEach((q) => {
      if (q.userIndex !== null && q.userIndex !== q.correctIndex)
        mistakes.push({
          q,
          title: s.contentRef.title,
          // 每题自带 subject（每日挑战混合卷）；缺省回退 session.subject（v1 兼容）
          subject: q.subject ?? s.subject ?? "language",
        });
    })
  );
  // 跨学科错题过滤（subject 分组，PRD §7.10.8）
  const subjectFilter = mistakeFilter;
  const visibleMistakes =
    subjectFilter === "all"
      ? mistakes
      : mistakes.filter((m) => m.subject === subjectFilter);

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
      title: tr("workspace.checkinPending"),
      sub: tr("workspace.checkinStreakHint"),
      pill: tr("workspace.today"),
      act: tr("workspace.goCheckin"),
      fn: doCheckin,
    });
  for (const s of ws.sessions) {
    if (!s.reviewed && s.date < t)
      tasks.push({
        overdue: true,
        title: tr("workspace.quizUnreviewed", { date: mdLabel(s.date) }),
        sub: s.contentRef.title,
        pill: tr("workspace.overdue"),
        act: tr("workspace.goReview"),
        fn: () => setActiveQuizId(s.id),
      });
  }
  if (!todaySession)
    tasks.push({
      overdue: false,
      title: tr("workspace.notStarted"),
      sub: tr("workspace.recordHint"),
      pill: tr("workspace.suggest"),
      act: tr("workspace.goStudy"),
      fn: () => {},
    });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 今天要处理 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2">
          {tr("workspace.pendingToday")}
        </h2>
        {tasks.length === 0 ? (
          <div className="text-center text-gray-400 py-3">
            {tr("workspace.allDone")}
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
          {tr("workspace.todayResults")}
        </h2>
        {!todaySession ? (
          <div className="text-center text-gray-400 py-6">
            <div className="text-3xl mb-2">🌱</div>
            {tr("workspace.noRecords")}
            <br />
            <span className="text-sm">{tr("workspace.resultsHint")}</span>
            <div className="mt-4">
              <Link href={localizedHref(locale, "/stories")} className="btn-primary">
                {tr("workspace.goStory")}
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
            {tr("workspace.history")}
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
                      {s.reviewed ? tr("workspace.reviewed") : tr("workspace.review")}
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
          {tr("workspace.selfQuiz")}
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          {tr("workspace.selfQuizDesc")}
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-sm text-gray-500">{tr("workspace.quizType")}</span>
          <button
            className={
              "text-sm px-4 py-2 rounded-full font-medium transition " +
              (liveMode === "choice"
                ? "bg-purple-600 text-white"
                : "bg-purple-50 text-purple-600")
            }
            onClick={() => setLiveMode("choice")}
          >
            {tr("workspace.quizChoice")}
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
            {tr("workspace.quizListening")}
          </button>
          <button
            disabled={!asrSupported}
            className={
              "text-sm px-4 py-2 rounded-full font-medium transition " +
              (liveMode === "speak"
                ? "bg-purple-600 text-white"
                : asrSupported
                ? "bg-purple-50 text-purple-600 hover:bg-purple-100"
                : "bg-gray-100 text-gray-400 cursor-not-allowed")
            }
            onClick={() => asrSupported && setLiveMode("speak")}
            title={!asrSupported ? tr("workspace.speechNotSupported") : undefined}
          >
            {tr("workspace.quizReading")}
          </button>
        </div>
        <button
          className="btn-primary"
          onClick={startLiveQuiz}
          disabled={liveMode === "speak" && !asrSupported}
        >
          {liveMode === "speak"
            ? tr("workspace.startReadingQuiz")
            : liveMode === "listen"
            ? tr("workspace.startListeningQuiz")
            : tr("workspace.startChoiceQuiz")}
        </button>
      </section>

      {/* 学习统计 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2">
          {tr("workspace.stats")}
        </h2>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard
            label={tr("workspace.statTotalTime")}
            value={stats.totalMin + " " + tr("progress.minutes")}
          />
          <StatCard
            label={tr("workspace.statTotalQuizzes")}
            value={stats.quizCount + " " + tr("workspace.unitQuestion")}
          />
          <StatCard label={tr("workspace.statAvgAccuracy")} value={stats.avgAcc + "%"} />
          <StatCard
            label={tr("workspace.statSentences")}
            value={stats.practicedCount + " / " + pool.length}
          />
        </div>
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{tr("workspace.contentCoverage")}</span>
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
          {tr("workspace.weeklyTime")}
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
                title={d.ds + " · " + d.min + " " + tr("progress.minutes")}
              />
              <span className="text-[10px] text-gray-400">{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 错题本 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2">
          {tr("workspace.mistakeBook")}
        </h2>
        {mistakes.length === 0 ? (
          <div className="text-center text-gray-400 py-3">
            {tr("workspace.noMistakes")}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {(
                [
                  ["all", tr("workspace.filterAll")],
                  ["language", tr("workspace.filterLanguage")],
                  ["math", tr("workspace.filterMath")],
                  ["logic", tr("workspace.filterLogic")],
                ] as const
              ).map(([key, label]) => {
                const count =
                  key === "all"
                    ? mistakes.length
                    : mistakes.filter((m) => m.subject === key).length;
                return (
                  <button
                    key={key}
                    onClick={() => setMistakeFilter(key)}
                    aria-pressed={mistakeFilter === key}
                    className={
                      "text-xs px-3 py-1.5 rounded-full font-medium transition min-h-[36px] " +
                      (mistakeFilter === key
                        ? "bg-purple-600 text-white"
                        : "bg-purple-50 text-purple-600")
                    }
                  >
                    {label}（{count}）
                  </button>
                );
              })}
            </div>
            <button className="btn-primary mb-3" onClick={startReview}>
              {tr("workspace.reviewMistakes", {
                count: String(visibleMistakes.length),
              })}
            </button>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {visibleMistakes.map((m, i) => (
                <div
                  key={i}
                  className="border border-gray-100 rounded-xl p-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        "text-[10px] px-1.5 py-0.5 rounded-full shrink-0 " +
                        (m.subject === "math"
                          ? "bg-orange-100 text-orange-600"
                          : m.subject === "logic"
                          ? "bg-teal-100 text-teal-600"
                          : "bg-purple-100 text-purple-600")
                      }
                    >
                      {tr(SUBJECT_LABEL_KEYS[m.subject])}
                    </span>
                    <span className="text-xs text-gray-400 truncate">
                      {m.title}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-gray-800 italic mt-1">
                    « {m.q.fr} »
                  </div>
                  <div className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <span className="text-red-500">
                      {tr("workspace.yourAnswer", {
                        answer: m.q.options[m.q.userIndex ?? 0],
                      })}
                    </span>
                    <span className="text-green-600">
                      {tr("workspace.correctAnswer", {
                        answer: m.q.options[m.q.correctIndex],
                      })}
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
          {tr("workspace.dailyCheckin")}
        </h2>
        <div className="flex items-center justify-between gap-3 mb-4">
          <button
            className="btn-primary min-w-[150px]"
            disabled={ws.checkins.includes(t)}
            onClick={doCheckin}
          >
            {ws.checkins.includes(t)
              ? tr("workspace.checkinDone")
              : tr("workspace.todayCheckin")}
          </button>
          <div className="flex gap-6">
            <div className="text-center">
              <div className="text-3xl font-extrabold text-purple-600 leading-none">
                {computeStreak(ws.checkins)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {tr("workspace.currentStreak")}
              </div>
            </div>
            <div className="text-center border-l border-gray-100 pl-6">
              <div className="text-3xl font-extrabold text-pink-500 leading-none">
                {computeLongestStreak(ws.checkins)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {tr("workspace.longestStreak")}
              </div>
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
                title={ds + (on ? " · " + tr("workspace.checkedIn") : "")}
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
          <span>{tr("workspace.notCheckedIn")}</span>
          <span className="w-3 h-3 rounded-md bg-purple-50" />
          <span className="w-3 h-3 rounded-md bg-purple-500" />
          <span>{tr("workspace.checkedIn")}</span>
        </div>
      </section>

      {/* 奖励积分 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2">
          {tr("workspace.rewardPoints")}
        </h2>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-3xl font-extrabold text-pink-500">
            {ws.points.total}
          </span>
          <span className="text-sm text-gray-500">
            {tr("workspace.availablePoints")}
          </span>
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
                  {tr(r.nameKey)}
                </div>
                <div className="text-xs font-bold text-pink-500">
                  {tr("workspace.costPoints", { cost: String(r.cost) })}
                </div>
                <button
                  className="btn-primary mt-1"
                  disabled={!can}
                  onClick={() => redeem(r.id)}
                >
                  {can ? tr("workspace.redeemBtn") : tr("workspace.insufficientPoints")}
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-3 border-t border-dashed border-gray-100">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">
            {tr("workspace.pointsHistory")}
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

      {/* Phase 5D：吉祥物养成 + 成就勋章 + 每日任务（T5D.1-3） */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2">
          {tr("workspace.growthCenter")}
        </h2>
        <MascotPen />
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">
            {tr("workspace.achievements")}
          </h3>
          <BadgeWall />
        </div>
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">
            {tr("workspace.dailyQuests")}
          </h3>
          <DailyQuestList />
        </div>
      </section>

      {/* Phase 5D：分学科统计（T5D.5） */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2">
          {tr("workspace.subjectStats")}
        </h2>
        <SubjectStats sessions={ws.sessions} />
      </section>

      {/* 数据备份 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
          {tr("workspace.dataBackup")}
        </h2>
        <p className="text-xs text-gray-500 mb-3">{tr("workspace.backupDesc")}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={exportJson}>
            {tr("workspace.exportJson")}
          </button>
          <label className="btn-secondary cursor-pointer">
            {tr("workspace.importRestore")}
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
            {tr("workspace.clearAllData")}
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
              onPlay={playFr}
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
              title={liveReview ? tr("workspace.mistakeReview") : undefined}
              // ── BUG-1：以下四个 props 原先漏传，导致跟读打分链路断裂 ──
              speakResults={speakResults}
              recState={recState}
              recMsg={recMsg}
              onPlay={playText}
              onAnswer={answerLive}
              onToggleReveal={toggleReveal}
              onSubmit={liveMode === "speak" ? submitSpeak : submitLive}
              onRecognize={recognize}
              onClose={() => setLiveOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
