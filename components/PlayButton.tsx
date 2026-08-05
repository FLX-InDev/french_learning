"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Language } from "@/lib/voiceConfig";
import { VOICE_CONFIG } from "@/lib/voiceConfig";

interface PlayButtonProps {
  text: string;
  voice?: string;
  label?: string;
  lang?: Language;
  size?: "sm" | "md";
}

type TTSProvider = "webspeech" | "read-aloud-cf";

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
// Web Speech API — voice selection helpers
// ────────────────────────────────────────────

// Preferred voice names per language, ordered by quality (best first)
// Top entries are exact iOS voice names confirmed on iPad Safari.
const PREFERRED_VOICES: Record<Language, string[]> = {
  zh: [
    "Yun",              // Apple zh-CN (iOS "云" voice) — TOP PICK
    "Yunyang",          // Microsoft Neural (Edge/Chrome)
    "Xiaoxiao",         // Microsoft Neural (Edge/Chrome)
    "Ting-Ting",        // Apple Premium (iOS/macOS)
    "婷婷",              // Apple Chinese name
    "Sinji",            // Apple zh-HK
    "Google",           // Chrome fallback
  ],
  en: [
    "Stephanie",        // Apple en-US (iOS, optimized quality) — TOP PICK
    "Samantha",         // Apple Premium (iOS/macOS)
    "Jenny",            // Microsoft Neural
    "Aria",             // Microsoft Neural
    "Daniel",           // Apple UK
    "Karen",            // Apple AU
    "Google US",        // Chrome
  ],
  fr: [
    "Audrey",           // Apple fr-FR enhanced (best on iOS) — TOP PICK
    "Aurélie",          // Apple fr-FR enhanced / Siri
    "Amélie",           // Apple fr-FR standard
    "Thomas",           // Apple fr-FR standard
    "Denise",           // Microsoft Neural (Edge/Chrome)
    "Henri",            // Microsoft Neural (Edge/Chrome)
    "Google français",  // Chrome fallback
  ],
};

/**
 * Pick the best available voice for a language.
 * Priority: explicit preferred names → Enhanced/Premium → Neural/Natural → first match.
 * For French, strictly match fr-FR to avoid Canadian French (fr-CA).
 */
function pickBestVoice(
  voices: SpeechSynthesisVoice[],
  langCode: string,
  lang: Language
): SpeechSynthesisVoice | null {
  const matching = voices.filter((v) =>
    lang === "fr" ? v.lang === "fr-FR" : v.lang.startsWith(langCode)
  );

  if (matching.length > 0) {
    console.log(
      `[PlayButton] ${lang} 可用语音 (${matching.length}):`,
      matching.map((v) => `${v.name} [${v.lang}]`).join(", ")
    );
  }

  if (matching.length === 0) {
    console.warn(`[PlayButton] ${lang}: 没有找到匹配 ${langCode} 的语音`);
    return null;
  }

  const preferred = PREFERRED_VOICES[lang] || [];
  for (const name of preferred) {
    const found = matching.find((v) => v.name.includes(name));
    if (found) {
      console.log(`[PlayButton] ${lang} 选中语音: "${found.name}" [${found.lang}] (匹配: "${name}")`);
      return found;
    }
  }

  const qualityKeywords = [
    "Enhanced", "Premium", "Natural", "Neural", "Wavenet", "Studio",
  ];
  for (const kw of qualityKeywords) {
    const found = matching.find((v) => v.name.includes(kw));
    if (found) return found;
  }

  const local = matching.find((v) => v.localService);
  if (local) return local;

  console.log(`[PlayButton] ${lang} 回退到第一个语音: "${matching[0].name}" [${matching[0].lang}]`);
  return matching[0];
}

// ────────────────────────────────────────────
// Component
// ────────────────────────────────────────────

export default function PlayButton({
  text,
  label,
  lang,
  size = "md",
}: PlayButtonProps) {
  const [status, setStatus] = useState<"idle" | "playing" | "loading">("idle");
  const [provider, setProvider] = useState<TTSProvider>("webspeech");

  // Web Speech API refs
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // read-aloud-cf audio ref
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch TTS provider config on mount (once)
  useEffect(() => {
    fetch("/api/tts/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.provider === "read-aloud-cf" && data.available) {
          setProvider("read-aloud-cf");
          console.log("[PlayButton] TTS 方案: read-aloud-cf");
        } else {
          console.log("[PlayButton] TTS 方案: Web Speech API");
        }
      })
      .catch(() => {
        console.log("[PlayButton] 无法获取 TTS 配置，使用 Web Speech API");
      });
  }, []);

  // Pre-load Web Speech voices (important for iOS Safari)
  useEffect(() => {
    if (provider !== "webspeech") return;

    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) voicesRef.current = v;
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis.cancel();
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
    if (provider === "read-aloud-cf") {
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
    utterance.rate = lang === "fr" ? 0.85 : 0.95;
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
        console.warn("[PlayButton] Web Speech 播放出错:", e.error);
      }
      utteranceRef.current = null;
      setStatus("idle");
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [text, lang]);

  const playReadAloudCF = useCallback(async () => {
    const voiceName = lang ? VOICE_CONFIG[lang].cfVoice : "en-US-JennyNeural";

    setStatus("loading");

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: voiceName }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error(
          "[PlayButton] read-aloud-cf 请求失败:",
          response.status,
          errorData?.error || response.statusText
        );
        setStatus("idle");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      audio.onplay = () => setStatus("playing");
      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setStatus("idle");
      };
      audio.onerror = () => {
        console.warn("[PlayButton] read-aloud-cf 音频播放出错");
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setStatus("idle");
      };

      audioRef.current = audio;
      await audio.play();
    } catch (err) {
      console.error("[PlayButton] read-aloud-cf 调用出错:", err);
      setStatus("idle");
    }
  }, [text, lang]);

  // ── Main click handler ──

  const handleClick = useCallback(() => {
    if (status === "playing" || status === "loading") {
      stopCurrent();
      setStatus("idle");
      return;
    }

    if (provider === "read-aloud-cf") {
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
