"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Language } from "@/lib/voiceConfig";
import {
  NORMAL_SPEECH_RATE,
  VOICE_CONFIG,
  playbackRate,
  utteranceRate,
} from "@/lib/voiceConfig";
import { pickBestVoice } from "@/lib/webSpeechVoice";
import { useAppState } from "@/components/AppStateProvider";
import { useI18n } from "@/lib/i18n";

interface PlayButtonProps {
  text: string;
  voice?: string;
  label?: string;
  lang?: Language;
  size?: "sm" | "md";
}

type TTSProvider = "webspeech" | "backend";

const langStyles: Record<
  Language,
  { bg: string; hover: string; text: string; ring: string }
> = {
  zh: {
    bg: "bg-red-50",
    hover: "hover:bg-red-100",
    text: "text-red-500",
    ring: "ring-red-200",
  },
  en: {
    bg: "bg-blue-50",
    hover: "hover:bg-blue-100",
    text: "text-blue-500",
    ring: "ring-blue-200",
  },
  fr: {
    bg: "bg-green-50",
    hover: "hover:bg-green-100",
    text: "text-green-600",
    ring: "ring-green-200",
  },
};

// ────────────────────────────────────────────
// Web Speech API — voice selection: moved to lib/webSpeechVoice.ts
// （与 lib/audioManager.ts 共用同一套挑选策略，T3.6）
// ────────────────────────────────────────────

// ────────────────────────────────────────────
// Component
// ────────────────────────────────────────────

export default function PlayButton({
  text,
  label,
  lang,
  size = "md",
}: PlayButtonProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<"idle" | "playing" | "loading">("idle");
  const [provider, setProvider] = useState<TTSProvider>("webspeech");
  // 全局语速（家长中心设置：0.75 慢速 / 0.9 正常，F5.2）
  const { state } = useAppState();
  const speechRate = state?.settings.speechRate ?? NORMAL_SPEECH_RATE;

  // Web Speech API refs
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // read-aloud backend audio ref
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch TTS provider config on mount (once)
  useEffect(() => {
    fetch("/api/tts/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.provider !== "webspeech" && data.available) {
          setProvider("backend");
          console.log(`[PlayButton] ${t('playbutton.ttsProviderBackend', { provider: data.provider })}`);
        } else {
          console.log(`[PlayButton] ${t('playbutton.ttsProviderWebSpeech')}`);
        }
      })
      .catch(() => {
        console.log(`[PlayButton] ${t('playbutton.ttsConfigError')}`);
      });
  }, []);

  // Pre-load Web Speech voices (important for iOS Safari)
  useEffect(() => {
    if (provider !== "webspeech") return;
    // 浏览器不支持语音合成时静默降级（jsdom / 老浏览器），避免整页崩溃
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) voicesRef.current = v;
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis?.cancel();
    };
  }, [provider]);

  // ── Stop handlers ──

  const stopWebSpeech = useCallback(() => {
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  }, []);

  const stopCurrent = useCallback(() => {
    if (provider === "backend") {
      stopAudio();
    } else {
      stopWebSpeech();
    }
  }, [provider, stopAudio, stopWebSpeech]);

  // ── Play handlers ──

  const playWebSpeech = useCallback(() => {
    window.speechSynthesis.cancel();

    const langCode = lang ? VOICE_CONFIG[lang].lang : "en-US";
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    utterance.rate = utteranceRate(lang ?? "en", speechRate);
    utterance.pitch = 1.0;

    const voices =
      voicesRef.current.length > 0
        ? voicesRef.current
        : window.speechSynthesis.getVoices();
    const bestVoice = lang
      ? pickBestVoice(voices, langCode, lang)
      : voices.find((v) => v.lang.startsWith(langCode)) || null;
    if (bestVoice) {
      utterance.voice = bestVoice;
    }

    utterance.onstart = () => setStatus("playing");
    utterance.onend = () => {
      utteranceRef.current = null;
      setStatus("idle");
    };
    utterance.onerror = (e) => {
      if (e.error !== "canceled") {
        console.warn(`[PlayButton] ${t('playbutton.webspeechError')}:`, e.error);
      }
      utteranceRef.current = null;
      setStatus("idle");
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [text, lang, speechRate]);

  const playReadAloudCF = useCallback(async () => {
    const voiceName = lang ? VOICE_CONFIG[lang].cfVoice : "en-US-JennyNeural";

    setStatus("loading");

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: voiceName, rate: speechRate }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error(
          "[PlayButton] " + t('playbutton.requestFailed'),
          response.status,
          errorData?.error || response.statusText
        );
        setStatus("idle");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      // 后端音频用播放速率实现全局语速（read-aloud-sf 不接受语速参数）
      audio.playbackRate = playbackRate(speechRate);

      audio.onplay = () => setStatus("playing");
      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setStatus("idle");
      };
      audio.onerror = () => {
        console.warn(`[PlayButton] ${t('playbutton.audioPlayError')}`);
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setStatus("idle");
      };

      audioRef.current = audio;
      await audio.play();
    } catch (err) {
      console.error(`[PlayButton] ${t('playbutton.callError')}:`, err);
      setStatus("idle");
    }
  }, [text, lang, speechRate]);

  // ── Main click handler ──

  const handleClick = useCallback(() => {
    if (status === "playing" || status === "loading") {
      stopCurrent();
      setStatus("idle");
      return;
    }

    if (provider === "backend") {
      playReadAloudCF();
    } else {
      playWebSpeech();
    }
  }, [status, provider, stopCurrent, playWebSpeech, playReadAloudCF]);

  // ── Cleanup on unmount ──

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // ── Render ──

  const displayLabel = label ?? (lang ? VOICE_CONFIG[lang].label : "🔊");
  const style = lang ? langStyles[lang] : langStyles.en;
  const sizeClasses =
    size === "sm"
      ? "px-1.5 py-0.5 text-xs gap-0.5"
      : "px-2 py-1 text-xs gap-1";

  const isActive = status === "playing" || status === "loading";

  return (
    <button
      onClick={handleClick}
      className={`
        inline-flex items-center rounded-md font-medium
        transition-all duration-150 shrink-0
        ${style.bg} ${style.hover} ${style.text}
        ${isActive ? `ring-2 ${style.ring}` : ""}
        ${sizeClasses}
      `}
      title={`朗读: ${text}`}
      aria-label={`朗读 ${displayLabel}`}
    >
      {status === "loading" ? (
        <svg
          className="w-3 h-3 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : status === "playing" ? (
        <svg
          className="w-3 h-3 animate-pulse"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M11.5 3.75a.75.75 0 011.08.02l5.25 5.5a.75.75 0 010 1.04l-5.25 5.5a.75.75 0 11-1.08-1.04L15.94 12H4.75a.75.75 0 010-1.5H15.94L11.5 6.53a.75.75 0 010-1.04l-.02-.02a.75.75 0 01.02-1.72z" />
        </svg>
      ) : (
        <svg
          className="w-3 h-3"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M11.5 3.75a.75.75 0 011.08.02l5.25 5.5a.75.75 0 010 1.04l-5.25 5.5a.75.75 0 11-1.08-1.04L15.94 12H4.75a.75.75 0 010-1.5H15.94L11.5 6.53a.75.75 0 010-1.04l-.02-.02a.75.75 0 01.02-1.72z" />
        </svg>
      )}
      <span>{displayLabel}</span>
    </button>
  );
}
