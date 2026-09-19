"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n, localizedHref } from "@/lib/i18n";
import { TriTitle } from "@/components/TriTitle";
import { useAppState } from "@/components/AppStateProvider";
import {
  cancelSpeech,
  configureSpeech,
  pause,
  playAudioUrl,
  speak,
  speechGeneration,
} from "@/lib/audioManager";
import { addPoints } from "@/lib/workspace";
import { usePronunciationCheck } from "@/components/usePronunciationCheck";
import { playSfx } from "@/lib/audioManager";
import type { Song } from "@/lib/contentTypes";
import type { Language } from "@/lib/voiceConfig";

/** 播放语言模式：三语轮读（默认，中→英→法）/ 单语 */
type KaraokeLang = "all" | "zh" | "en" | "fr";

const LANG_ROWS: { key: Exclude<KaraokeLang, "all">; badge: string }[] = [
  { key: "zh", badge: "bg-red-50 text-red-500" },
  { key: "en", badge: "bg-blue-50 text-blue-500" },
  { key: "fr", badge: "bg-green-50 text-green-600" },
];

/**
 * 儿歌卡拉OK播放器（PRD §7.4.2–§7.4.6，Dev-Plan T3.3）：
 * - 逐句三语歌词，当前句高亮放大，正在朗读的语言行同步强调；
 * - TTS 逐句朗读（三语轮读或单语切换），句间停顿 800ms；
 * - 跟我唱：每句后暂停 3s 倒计时（评分版为 Phase 5C）；
 * - 听完 ≥80% 记「音乐任务」+5 分（每歌每天一次，F4.6）；
 * - 点击任意歌词行跳转播放，再次点击停止；
 * - song.audio 字段预留：有真人音频时切换音频驱动（按时间戳高亮）。
 */
export function KaraokePlayer({ song }: { song: Song }) {
  const { t, locale } = useI18n();
  const { state, update } = useAppState();
  const [langMode, setLangMode] = useState<KaraokeLang>("all");
  const [singAlong, setSingAlong] = useState(false);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [activeLang, setActiveLang] = useState<Language | null>(null);
  const [playing, setPlaying] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  // 跟唱评分（T5C.5）：ASR 接入，及格线比跟读放宽 10 分
  const pr = usePronunciationCheck();
  const [singScore, setSingScore] = useState<{ line: number; score: number } | null>(null);
  const taskRecordedRef = useRef(false);
  const audioTimeRef = useRef<HTMLAudioElement | null>(null);
  const langModeRef = useRef<KaraokeLang>(langMode);
  const singAlongRef = useRef(singAlong);

  const speechRate = state?.settings.speechRate ?? 0.9;
  const level = state?.profile.level ?? "L3";
  langModeRef.current = langMode;
  singAlongRef.current = singAlong;

  /** ≥80% 完成即记「音乐任务」+5 分（每歌每天一次，F4.6） */
  const recordTask = useCallback(() => {
    if (!update || !state) return;
    const key = `song_${song.id}`;
    const today = new Date();
    const ds =
      today.getFullYear() +
      "-" +
      String(today.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(today.getDate()).padStart(2, "0");
    if (state.taskFlags[key] === ds) return;
    update((s) => ({
      ...s,
      taskFlags: { ...s.taskFlags, [key]: ds },
      points: addPoints(s.points, 5, t("karaoke.rewardListen")),
    }));
  }, [update, state, song.id, t]);

  const stop = useCallback(() => {
    cancelSpeech();
    if (audioTimeRef.current) {
      audioTimeRef.current.pause();
      audioTimeRef.current = null;
    }
    setPlaying(false);
    setActiveLine(null);
    setActiveLang(null);
    setCountdown(null);
  }, []);

  /** TTS 逐句播放循环（generation 守卫，随时可停） */
  const playFrom = useCallback(
    async (startLine: number) => {
      cancelSpeech();
      configureSpeech(speechRate);
      const gen = speechGeneration();
      setPlaying(true);
      setFinished(false);
      if (startLine === 0) taskRecordedRef.current = false;

      for (let i = startLine; i < song.lines.length; i++) {
        if (speechGeneration() !== gen) return;
        setActiveLine(i);
        const langs: Language[] =
          langModeRef.current === "all" ? ["zh", "en", "fr"] : [langModeRef.current];
        for (const lang of langs) {
          if (speechGeneration() !== gen) return;
          setActiveLang(lang);
          await speak(song.lines[i][lang], lang);
        }
        if (speechGeneration() !== gen) return;

        // 进度任务：完成句数占比 ≥ 80%（F4.6）
        if (!taskRecordedRef.current && (i + 1) / song.lines.length >= 0.8) {
          taskRecordedRef.current = true;
          recordTask();
        }

        if (singAlongRef.current) {
          // 跟我唱：3 秒倒计时（PRD §7.4.3，评分版 T5C.5）
          for (let c = 3; c >= 1; c--) {
            if (speechGeneration() !== gen) return;
            setCountdown(c);
            await pause(1000);
          }
          if (speechGeneration() !== gen) return;
          setCountdown(null);
          // 跟唱评分：启动 ASR 识别当前句
          if (pr.asrSupported) {
            pr.start(song.lines[i].fr, "fr", level, (r, passed) => {
              setSingScore({ line: i, score: r.score });
              playSfx(passed ? "correct" : "encourage");
            });
            // 等待评分完成（最长 5s）
            await pause(5000);
          }
          if (speechGeneration() !== gen) return;
        } else {
          await pause(800); // 句间停顿（PRD §7.4.2）
        }
      }
      if (speechGeneration() !== gen) return;
      setActiveLine(null);
      setActiveLang(null);
      setPlaying(false);
      setFinished(true);
    },
    [song, speechRate, recordTask]
  );

  /** 真人音频驱动（audio 字段 + time 时间戳；当前内容包为空，预留 P2 资产） */
  const playAudioTrack = useCallback(async () => {
    if (!song.audio) return;
    cancelSpeech();
    const gen = speechGeneration();
    setPlaying(true);
    setFinished(false);
    taskRecordedRef.current = false;
    const audio = new Audio(song.audio);
    audioTimeRef.current = audio;
    audio.ontimeupdate = () => {
      const t = audio.currentTime;
      let idx = 0;
      song.lines.forEach((line, i) => {
        if (line.time !== undefined && line.time <= t) idx = i;
      });
      setActiveLine(idx);
      if (!taskRecordedRef.current && audio.duration > 0 && t / audio.duration >= 0.8) {
        taskRecordedRef.current = true;
        recordTask();
      }
    };
    audio.onended = () => {
      if (speechGeneration() === gen) {
        setPlaying(false);
        setActiveLine(null);
        setFinished(true);
      }
    };
    await audio.play().catch(() => setPlaying(false));
    void gen;
  }, [song, recordTask]);

  // 进入播放页自动从第 1 句开始（PRD §7.4.2）；audio 字段存在则走音频驱动
  useEffect(() => {
    if (song.audio) void playAudioTrack();
    else void playFrom(0);
    return () => {
      cancelSpeech();
      if (audioTimeRef.current) audioTimeRef.current.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  const hasAudio = !!song.audio;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="text-center">
        <div className="text-5xl" aria-hidden>
          {song.emoji || "🎵"}
        </div>
        <TriTitle tri={song.title} mainClass="text-xl font-bold text-gray-800 mt-2" subClass="text-sm text-gray-500" />
      </div>

      {/* 控制条 */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="flex rounded-full bg-purple-50 p-0.5" role="group" aria-label={t("karaoke.langLabel")}>
          {(
            [
              ["all", t("karaoke.langAllThree")],
              ["fr", t("karaoke.langFr")],
              ["en", t("karaoke.langEn")],
              ["zh", t("karaoke.langZh")],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setLangMode(mode)}
              aria-pressed={langMode === mode}
              className={
                "text-xs px-3 py-1.5 rounded-full font-medium transition min-h-[36px] " +
                (langMode === mode ? "bg-purple-600 text-white" : "text-purple-600")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSingAlong((v) => !v)}
          aria-pressed={singAlong}
          className={
            "text-xs px-3 py-1.5 rounded-full font-medium transition min-h-[36px] " +
            (singAlong ? "bg-pink-500 text-white" : "bg-pink-50 text-pink-500")
          }
          title={t("karaoke.singAlongTitle")}
        >
          {t("karaoke.singAlong", { on: singAlong ? t("karaoke.on") : "" })}
        </button>
        <button
          className={
            "min-h-[40px] px-4 rounded-full text-sm font-semibold transition " +
            (playing
              ? "bg-red-50 text-red-500 hover:bg-red-100"
              : "bg-purple-600 text-white hover:bg-purple-700")
          }
          onClick={() => (playing ? stop() : void (hasAudio ? playAudioTrack() : playFrom(0)))}
          aria-label={playing ? t("karaoke.stop") : t("karaoke.play")}
        >
          {playing ? t("karaoke.stopBtn") : t("karaoke.playBtn")}
        </button>
      </div>

      {/* 歌词（点击任意行跳转播放） */}
      <div className="space-y-2">
        {song.lines.map((line, i) => {
          const active = activeLine === i;
          return (
            <button
              key={i}
              onClick={() => (playing && active ? stop() : void (hasAudio ? playAudioTrack() : playFrom(i)))}
              className={
                "w-full text-left rounded-xl border p-3 transition-all " +
                (active
                  ? "border-purple-400 bg-purple-50 shadow-md scale-[1.02]"
                  : "border-gray-100 bg-white hover:bg-purple-50/50")
              }
              aria-label={t("karaoke.playLine", { n: String(i + 1) })}
            >
              {LANG_ROWS.map(({ key, badge }) => (
                <div
                  key={key}
                  className={
                    "flex items-center gap-2 py-0.5 " +
                    (active && activeLang === key ? "font-bold" : "")
                  }
                >
                  <span
                    className={
                      "shrink-0 text-[10px] font-bold px-1 py-0.5 rounded " + badge
                    }
                  >
                    {t(`karaoke.short${key.charAt(0).toUpperCase() + key.slice(1)}`)}
                  </span>
                  <span
                    className={
                      "text-sm " +
                      (key === "fr" ? "text-gray-600 italic" : "text-gray-700") +
                      (active && activeLang === key ? " text-purple-700" : "")
                    }
                  >
                    {line[key]}
                  </span>
                </div>
              ))}
            </button>
          );
        })}
      </div>

      {/* 跟唱倒计时 */}
      {countdown !== null && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110]">
          <div className="bg-pink-500 text-white rounded-full px-6 py-3 shadow-lg flex items-center gap-3 animate-pulse">
            <span className="text-2xl font-extrabold">{countdown}</span>
            <span className="text-sm font-bold">{t("karaoke.yourTurnSing")}</span>
          </div>
        </div>
      )}

      {finished && (
        <div className="text-center text-sm text-green-600 font-semibold py-2">
          {t("karaoke.singingDone")}
        </div>
      )}

      <div className="text-center pt-2">
        <Link href={localizedHref(locale, "/songs")} className="text-sm text-purple-500">
          {t("karaoke.backToSongs")}
        </Link>
      </div>
    </div>
  );
}
