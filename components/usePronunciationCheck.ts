"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  scorePronunciation,
  type Candidate,
  type SpeechScore,
} from "@/lib/pronunciation";
import { isPronunciationPass, type Level } from "@/lib/levels";
import {
  getSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
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
  const [state, setState] = useState<PronState>("idle");
  const [result, setResult] = useState<SpeechScore | null>(null);
  const [recUrl, setRecUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const recRef = useRef<any>(null);
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

  const reset = useCallback(() => {
    setState("idle");
    setResult(null);
    setRecUrl(null);
    setMsg("");
    try {
      recRef.current?.abort?.();
    } catch {
      /* 忽略 */
    }
    stopRecorder();
  }, [stopRecorder]);

  const start = useCallback(
    (
      targetText: string,
      lang: SpeakLang,
      level: Level,
      onScored?: (r: SpeechScore, passed: boolean) => void
    ) => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        setState("unsupported");
        setMsg("当前浏览器不支持语音识别，建议使用 Chrome / Edge。");
        return;
      }
      setResult(null);
      setRecUrl(null);
      setMsg("");
      setState("recording");

      // 录音（T5A.4）：与识别并行；不可用时静默跳过（评分不受影响）
      if (recorderSupported) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            streamRef.current = stream;
            chunksRef.current = [];
            const mr = new MediaRecorder(stream);
            mr.ondataavailable = (e) => {
              if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            mr.onstop = () => {
              if (chunksRef.current.length === 0) return;
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

      rec.onresult = (event: any) => {
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
        const score = scorePronunciation(targetText, cands, lang);
        const passed = isPronunciationPass(score.score, level);
        setResult(score);
        setState("done");
        stopRecorder();
        onScored?.(score, passed);
      };

      rec.onerror = (event: any) => {
        const code = event.error;
        stopRecorder();
        if (code === "not-allowed" || code === "service-not-allowed") {
          setState("denied");
          setMsg("麦克风权限被拒绝，请在浏览器设置中允许后重试。");
        } else if (code === "network") {
          setState("error");
          setMsg("识别服务不可用，请检查网络后重试。");
        } else if (code === "no-speech") {
          setState("error");
          setMsg("没有检测到语音，请靠近麦克风再试一次。");
        } else {
          setState("error");
          setMsg("识别失败：" + (code || "未知错误"));
        }
      };

      rec.onend = () => {
        stopRecorder();
        setState((s) => (s === "recording" ? "idle" : s));
      };

      try {
        rec.start();
      } catch {
        setState("error");
        setMsg("无法启动录音，请检查麦克风权限。");
        stopRecorder();
      }
    },
    [recorderSupported, stopRecorder]
  );

  // 卸载清理：停止识别与录音流
  useEffect(
    () => () => {
      try {
        recRef.current?.abort?.();
      } catch {
        /* 忽略 */
      }
      stopRecorder();
    },
    [stopRecorder]
  );

  return {
    state,
    result,
    recUrl,
    msg,
    asrSupported,
    recorderSupported,
    start,
    reset,
  };
}
