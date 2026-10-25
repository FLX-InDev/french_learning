"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n, localizedHref } from "@/lib/i18n";
import { translate } from "@/lib/i18nDict";
import { TriTitle } from "@/components/TriTitle";
import { useAppState } from "@/components/AppStateProvider";
import {
  cancelSpeech,
  configureSpeech,
  pause,
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
  // 换歌只重建播放会话，保留用户的语言和跟唱选择。
  const [langMode, setLangMode] = useState<KaraokeLang>("all");
  const [singAlong, setSingAlong] = useState(false);
  return (
    <KaraokeSession key={song.id} initialSong={song} langMode={langMode}
      setLangMode={setLangMode} singAlong={singAlong} setSingAlong={setSingAlong} />
  );
}

function languagesFor(mode: KaraokeLang): Language[] {
  return mode === "all" ? ["zh", "en", "fr"] : [mode];
}

type PlayIntent = { startLine: number; languages: Language[] };

function KaraokeSession({ initialSong, langMode, setLangMode, singAlong, setSingAlong }: {
  initialSong: Song;
  langMode: KaraokeLang;
  setLangMode: (mode: KaraokeLang) => void;
  singAlong: boolean;
  setSingAlong: (value: boolean) => void;
}) {
  // 同一个 id 对应固定内容；存档/locale 更新或父级复制对象都不重开播放。
  const [song] = useState(initialSong);
  const { t, locale } = useI18n();
  const { state, update } = useAppState();
  const [intent, setIntent] = useState<PlayIntent | null>(() =>
    song.lines.length ? { startLine: 0, languages: languagesFor(langMode) } : null
  );
  // 自动播放意图和首句游标属于初始状态，不在 mount effect 内补写。
  const [activeLine, setActiveLine] = useState<number | null>(intent ? 0 : null);
  const [activeLang, setActiveLang] = useState<Language | null>(
    intent && !song.audio ? intent.languages[0] : null
  );
  const [playing, setPlaying] = useState(!!intent);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [finished, setFinished] = useState(!intent);
  const { start: startPronunciation, cancel: cancelPronunciation, asrSupported } = usePronunciationCheck();
  const speechRate = state?.settings.speechRate ?? 0.9;
  const level = state?.profile.level ?? "L3";
  const optionsRef = useRef({ langMode, singAlong, level, asrSupported });
  const localeRef = useRef(locale);
  useEffect(() => {
    optionsRef.current = { langMode, singAlong, level, asrSupported };
    localeRef.current = locale;
  }, [langMode, singAlong, level, asrSupported, locale]);
  useEffect(() => {
    configureSpeech(speechRate);
  }, [speechRate]);

  /** ≥80% 完成即记「音乐任务」+5 分；在更新函数中检查最新存档。 */
  const recordTask = useCallback(() => {
    const key = `song_${song.id}`;
    const today = new Date();
    const ds =
      today.getFullYear() + "-" +
      String(today.getMonth() + 1).padStart(2, "0") + "-" +
      String(today.getDate()).padStart(2, "0");
    const reason = translate("karaoke.rewardListen", undefined, localeRef.current);
    update((s) => s.taskFlags[key] === ds ? s : ({
      ...s,
      taskFlags: { ...s.taskFlags, [key]: ds },
      points: addPoints(s.points, 5, reason),
    }));
  }, [update, song.id]);

  const stop = () => {
    cancelSpeech();
    cancelPronunciation();
    setIntent(null);
    setPlaying(false);
    setActiveLine(null);
    setActiveLang(null);
    setCountdown(null);
  };

  const playFrom = (startLine: number) => {
    if (!song.lines[startLine]) return;
    cancelSpeech();
    cancelPronunciation();
    const languages = languagesFor(langMode);
    setIntent({ startLine, languages });
    setPlaying(true);
    setFinished(false);
    setActiveLine(startLine);
    setActiveLang(song.audio ? null : languages[0]);
    setCountdown(null);
  };

  useEffect(() => {
    if (!intent) return;
    cancelSpeech();
    const gen = speechGeneration();
    let live = true;
    let taskRecorded = false;
    const cancelled = () => !live || speechGeneration() !== gen;
    let audio: HTMLAudioElement | null = null;

    if (song.audio) {
      // 真人音频由媒体事件推进高亮/完成；跳句按时间戳定位。
      const track = new Audio(song.audio);
      audio = track;
      track.onloadedmetadata = () => {
        if (!cancelled()) track.currentTime = song.lines[intent.startLine].time ?? 0;
      };
      track.ontimeupdate = () => {
        if (cancelled()) return;
        let idx = 0;
        song.lines.forEach((line, i) => {
          if (line.time !== undefined && line.time <= track.currentTime) idx = i;
        });
        setActiveLine(idx);
        if (!taskRecorded && track.duration > 0 && track.currentTime / track.duration >= 0.8) {
          taskRecorded = true;
          recordTask();
        }
      };
      track.onended = () => {
        if (cancelled()) return;
        setPlaying(false);
        setActiveLine(null);
        setFinished(true);
      };
      const playbackFailed = () => {
        if (cancelled()) return;
        setPlaying(false);
        setActiveLine(null);
      };
      track.onerror = playbackFailed;
      track.play().catch(playbackFailed);
    } else {
      const run = async () => {
        let languages = intent.languages;
        for (let i = intent.startLine; i < song.lines.length; i++) {
          for (let j = 0; j < languages.length; j++) {
            if (cancelled()) return;
            const lang = languages[j];
            await speak(song.lines[i][lang], lang);
            if (cancelled()) return;
            if (j + 1 < languages.length) setActiveLang(languages[j + 1]);
          }

          if (!taskRecorded && (i + 1) / song.lines.length >= 0.8) {
            taskRecorded = true;
            recordTask();
          }
          if (optionsRef.current.singAlong) {
            for (let c = 3; c >= 1; c--) {
              setCountdown(c);
              await pause(1000);
              if (cancelled()) return;
            }
            setCountdown(null);
            const { asrSupported, level } = optionsRef.current;
            if (asrSupported) {
              startPronunciation(song.lines[i].fr, "fr", level, (_result, passed) => {
                if (!cancelled()) playSfx(passed ? "correct" : "encourage");
              });
              await pause(5000);
              if (cancelled()) return;
              cancelPronunciation();
            }
          } else {
            await pause(800);
            if (cancelled()) return;
          }
          if (i + 1 < song.lines.length) {
            languages = languagesFor(optionsRef.current.langMode);
            setActiveLine(i + 1);
            setActiveLang(languages[0]);
          }
        }
        if (cancelled()) return;
        setActiveLine(null);
        setActiveLang(null);
        setPlaying(false);
        setFinished(true);
      };
      run();
    }

    return () => {
      live = false;
      cancelSpeech();
      cancelPronunciation();
      if (audio) {
        audio.onloadedmetadata = null;
        audio.ontimeupdate = null;
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
      }
    };
  }, [intent, song, recordTask, startPronunciation, cancelPronunciation]);

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
          onClick={() => setSingAlong(!singAlong)}
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
          onClick={() => (playing ? stop() : playFrom(0))}
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
              onClick={() => (playing && active ? stop() : playFrom(i))}
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
