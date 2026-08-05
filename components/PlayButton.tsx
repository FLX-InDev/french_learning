"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Language } from "@/lib/voiceConfig";
import { VOICE_CONFIG } from "@/lib/voiceConfig";

interface PlayButtonProps {
  text: string;
  voice?: string; // kept for backwards compat, unused
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

export default function PlayButton({
  text,
  label,
  lang,
  size = "md",
}: PlayButtonProps) {
  const [status, setStatus] = useState<"idle" | "playing">("idle");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const stopCurrent = useCallback(() => {
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
  }, []);

  const handleClick = useCallback(() => {
    // If already playing, stop
    if (status === "playing") {
      stopCurrent();
      setStatus("idle");
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang ? VOICE_CONFIG[lang].lang : "en-US";
    utterance.rate = lang === "fr" ? 0.85 : 0.9;
    utterance.pitch = 1.0;

    // Try to pick a high-quality voice for the language
    const voices = window.speechSynthesis.getVoices();
    const matchingVoices = voices.filter((v) =>
      v.lang.startsWith(utterance.lang)
    );
    // Prefer voices with "Natural", "Neural", or "Enhanced" in the name
    const preferred =
      matchingVoices.find(
        (v) =>
          v.name.includes("Natural") ||
          v.name.includes("Neural") ||
          v.name.includes("Enhanced")
      ) || matchingVoices[0];
    if (preferred) {
      utterance.voice = preferred;
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

  // Display label
  const displayLabel = label ?? (lang ? VOICE_CONFIG[lang].label : "🔊");

  // Style
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
        <svg className="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
          <path d="M11.5 3.75a.75.75 0 011.08.02l5.25 5.5a.75.75 0 010 1.04l-5.25 5.5a.75.75 0 11-1.08-1.04L15.94 12H4.75a.75.75 0 010-1.5H15.94L11.5 6.53a.75.75 0 010-1.04l-.02-.02a.75.75 0 01.02-1.72z" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <path d="M11.5 3.75a.75.75 0 011.08.02l5.25 5.5a.75.75 0 010 1.04l-5.25 5.5a.75.75 0 11-1.08-1.04L15.94 12H4.75a.75.75 0 010-1.5H15.94L11.5 6.53a.75.75 0 010-1.04l-.02-.02a.75.75 0 01.02-1.72z" />
        </svg>
      )}
      <span>{displayLabel}</span>
    </button>
  );
}
