"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  scorePronunciation,
  type Candidate,
  type SpeechScore,
} from "@/lib/pronunciation";
import { isPronunciationPass, type Level } from "@/lib/levels";
import { useI18n, type Locale } from "@/lib/i18n";
import { translate } from "@/lib/i18nDict";
import {
  getSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
  type SpeechRecognitionLike,
} from "@/lib/speechRecognition";
import type { SpeakLang } from "@/lib/workspace";

export type PronState =
  | "idle"
  | "recording"
  | "denied"
  | "unsupported"
  | "error"
  | "done";

/**
 * 单词跟读评分 hook（PRD §7.2.5 + §7.2.7，Phase 5A T5A.3/T5A.4）：
 * - 复用 scorePronunciation 管线（与句子跟读同一算法），及格线随学段读取；
 * - 同时用 MediaRecorder 录下孩子的发音，评分结束后产出回放 URL（对比原音）；
 * - 录音不可用不阻塞评分；ASR 不支持的浏览器（Firefox）由调用方隐藏跟读区块。
 */
export function usePronunciationCheck() {
  const { locale } = useI18n();
  // 事件回调内取当前界面语言（避免把 locale 塞进各 useCallback 依赖导致回调重建）
  const localeRef = useRef<Locale>(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  const [state, setState] = useState<PronState>("idle");
  const [result, setResult] = useState<SpeechScore | null>(null);
  const [recUrl, setRecUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const runIdRef = useRef(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const asrSupported = isSpeechRecognitionSupported();
  const recorderSupported =
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  const stopRecorder = useCallback(() => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // 取消资源而不写 React 状态，也可用于播放会话和卸载清理。
  const cancel = useCallback(() => {
    runIdRef.current++;
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* 忽略 */
      }
    }
    stopRecorder();
  }, [stopRecorder]);

  const reset = useCallback(() => {
    cancel();
    setState("idle");
    setResult(null);
    setRecUrl(null);
    setMsg("");
  }, [cancel]);

  const start = useCallback(
    (
      targetText: string,
      lang: SpeakLang,
      level: Level,
      onScored?: (r: SpeechScore, passed: boolean) => void
    ) => {
      cancel();
      const runId = runIdRef.current;
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        setState("unsupported");
        setMsg(translate("workspace.speechNotSupported", undefined, localeRef.current));
        return;
      }
      setResult(null);
      setRecUrl(null);
      setMsg("");
      setState("recording");

      let accepting = true;
      // 录音（T5A.4）：与识别并行；不可用时静默跳过（评分不受影响）
      if (recorderSupported) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            if (runIdRef.current !== runId || !accepting) {
              stream.getTracks().forEach((track) => track.stop());
              return;
            }
            streamRef.current = stream;
            chunksRef.current = [];
            const mr = new MediaRecorder(stream);
            mr.ondataavailable = (e) => {
              if (runIdRef.current === runId && e.data.size > 0) chunksRef.current.push(e.data);
            };
            mr.onstop = () => {
              if (runIdRef.current !== runId || chunksRef.current.length === 0) return;
              const blob = new Blob(chunksRef.current, {
                type: chunksRef.current[0]?.type || "audio/webm",
              });
              setRecUrl(URL.createObjectURL(blob));
            };
            mediaRef.current = mr;
            mr.start();
          })
          .catch(() => {
            /* 无麦克风权限时不阻塞 ASR 评分 */
          });
      }

      const rec = new Ctor();
      rec.lang = lang === "fr" ? "fr-FR" : "en-US";
      rec.interimResults = false;
      rec.continuous = false;
      rec.maxAlternatives = 5;
      recRef.current = rec;

      rec.onresult = (event) => {
        if (runIdRef.current !== runId || recRef.current !== rec || !accepting) return;
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
        const score = scorePronunciation(targetText, cands, lang, localeRef.current);
        const passed = isPronunciationPass(score.score, level);
        accepting = false;
        setResult(score);
        setState("done");
        stopRecorder();
        onScored?.(score, passed);
      };

      rec.onerror = (event) => {
        if (runIdRef.current !== runId || recRef.current !== rec || !accepting) return;
        accepting = false;
        const code = event.error;
        const locale = localeRef.current;
        stopRecorder();
        if (code === "not-allowed" || code === "service-not-allowed") {
          setState("denied");
          setMsg(translate("workspace.micDeniedRetry", undefined, locale));
        } else if (code === "network") {
          setState("error");
          setMsg(translate("workspace.asrNetwork", undefined, locale));
        } else if (code === "no-speech") {
          setState("error");
          setMsg(translate("workspace.asrNoSpeech", undefined, locale));
        } else {
          setState("error");
          setMsg(
            translate("workspace.asrFailed", { code: code || translate("workspace.asrUnknown", undefined, locale) }, locale)
          );
        }
      };

      rec.onend = () => {
        if (runIdRef.current !== runId) return;
        accepting = false;
        recRef.current = null;
        stopRecorder();
        setState((s) => (s === "recording" ? "idle" : s));
      };

      try {
        rec.start();
      } catch {
        accepting = false;
        cancel();
        setState("error");
        setMsg(translate("workspace.asrStartFailed", undefined, localeRef.current));
      }
    },
    [cancel, recorderSupported, stopRecorder]
  );

  // 卸载清理：停止识别与录音流，丢弃晚到的授权或识别回调。
  useEffect(() => cancel, [cancel]);

  return {
    state,
    result,
    recUrl,
    msg,
    asrSupported,
    recorderSupported,
    start,
    reset,
    cancel,
  };
}
