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
  // For French, use exact match to avoid fr-CA; for others, use startsWith
  const matching = voices.filter((v) =>
    lang === "fr" ? v.lang === "fr-FR" : v.lang.startsWith(langCode)
  );

  // Debug: log available voices for this language (helps iOS troubleshooting)
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

  // 1. Try preferred voice names in order
  const preferred = PREFERRED_VOICES[lang] || [];
  for (const name of preferred) {
    const found = matching.find((v) => v.name.includes(name));
    if (found) {
      console.log(`[PlayButton] ${lang} 选中语音: "${found.name}" [${found.lang}] (匹配: "${name}")`);
      return found;
    }
  }

  // 2. Try quality keywords (cross-platform)
  const qualityKeywords = [
    "Enhanced",
    "Premium",
    "Natural",
    "Neural",
    "Wavenet",
    "Studio",
  ];
  for (const kw of qualityKeywords) {
    const found = matching.find((v) => v.name.includes(kw));
    if (found) return found;
  }

  // 3. Prefer localService voices (usually better quality on Apple devices)
  const local = matching.find((v) => v.localService);
  if (local) return local;

  // 4. Fallback to first match
  console.log(`[PlayButton] ${lang} 回退到第一个语音: "${matching[0].name}" [${matching[0].lang}]`);
  return matching[0];
}

export default function PlayButton({
  text,
  label,
  lang,
  size = "md",
}: PlayButtonProps) {
  const [status, setStatus] = useState<"idle" | "playing">("idle");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // Pre-load voices (important for iOS Safari where getVoices() is async)
  useEffect(() => {
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
  }, []);

  const stopCurrent = useCallback(() => {
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
  }, []);

  const handleClick = useCallback(() => {
    if (status === "playing") {
      stopCurrent();
      setStatus("idle");
      return;
    }

    window.speechSynthesis.cancel();

    const langCode = lang ? VOICE_CONFIG[lang].lang : "en-US";
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;

    // Slightly slower rate for French to aid comprehension;
    // standard rate for others
    utterance.rate = lang === "fr" ? 0.85 : 0.95;
    utterance.pitch = 1.0;

    // Pick the best voice
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
        console.warn("[PlayButton] 语音播放出错:", e.error);
      }
      utteranceRef.current = null;
      setStatus("idle");
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [text, lang, status, stopCurrent]);

  const displayLabel = label ?? (lang ? VOICE_CONFIG[lang].label : "🔊");
  const style = lang ? langStyles[lang] : langStyles.en;
  const sizeClasses =
    size === "sm"
      ? "px-1.5 py-0.5 text-xs gap-0.5"
      : "px-2 py-1 text-xs gap-1";

  return (
    <button
      onClick={handleClick}
      className={`
        inline-flex items-center rounded-md font-medium
        transition-all duration-150 shrink-0
        ${style.bg} ${style.hover} ${style.text}
        ${status === "playing" ? `ring-2 ${style.ring}` : ""}
        ${sizeClasses}
      `}
      title={`朗读: ${text}`}
      aria-label={`朗读 ${displayLabel}`}
    >
      {status === "playing" ? (
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
