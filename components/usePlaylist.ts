"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelSpeech,
  configureSpeech,
  pause,
  speak,
  speechGeneration,
} from "@/lib/audioManager";
import type { Language } from "@/lib/voiceConfig";

/** 连播语言模式：仅法语（默认）/ 三语轮读（中→英→法） */
export type LangMode = "fr" | "all";

/**
 * 顺序播放清单（PRD §7.2.3 连播模式）：
 * - 当前句高亮由 activeIndex 驱动；
 * - 点击任意句跳转（toggle(index)：播到该句时点击则停止）；
 * - 再次点击停止；卸载/学段内容变化时自动取消。
 */
export function usePlaylist(opts: {
  count: number;
  /** 第 index 行要播放的序列（依 langMode 构建：fr 单条 / all 三条） */
  buildItems: (index: number, langMode: LangMode) => { text: string; lang: Language }[];
  gapMs?: number;
  speechRate: number;
}) {
  const { count, buildItems, gapMs = 400, speechRate } = opts;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [langMode, setLangMode] = useState<LangMode>("fr");
  const runIdRef = useRef(0);

  useEffect(() => {
    configureSpeech(speechRate);
  }, [speechRate]);

  const stop = useCallback(() => {
    runIdRef.current++;
    cancelSpeech();
    setPlaying(false);
    setActiveIndex(null);
  }, []);

  const start = useCallback(
    (from = 0) => {
      const runId = ++runIdRef.current;
      cancelSpeech();
      const gen = speechGeneration();
      setPlaying(true);
      void (async () => {
        const cancelled =
          () => runIdRef.current !== runId || speechGeneration() !== gen;
        for (let i = from; i < count; i++) {
          if (cancelled()) break;
          setActiveIndex(i);
          for (const it of buildItems(i, langMode)) {
            if (cancelled()) break;
            await speak(it.text, it.lang);
          }
          if (cancelled()) break;
          if (gapMs > 0) await pause(gapMs);
        }
        if (runIdRef.current === runId) {
          setPlaying(false);
          setActiveIndex(null);
        }
      })();
    },
    [count, buildItems, langMode, gapMs]
  );

  /** 点击某行：正在播该行 → 停止；否则从该行开始播 */
  const toggle = useCallback(
    (index: number) => {
      if (playing && activeIndex === index) stop();
      else start(index);
    },
    [playing, activeIndex, stop, start]
  );

  // 语言模式切换时停止（避免半途混播两种模式）
  useEffect(() => {
    runIdRef.current++;
    cancelSpeech();
    setPlaying(false);
    setActiveIndex(null);
  }, [langMode]);

  // 卸载时停止
  useEffect(
    () => () => {
      runIdRef.current++;
      cancelSpeech();
    },
    []
  );

  return { activeIndex, playing, langMode, setLangMode, start, stop, toggle };
}
