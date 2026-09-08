"use client";

import { useRef } from "react";

/**
 * 录音回放对比（PRD §7.2.7，Phase 5A T5A.4）：
 * 「原音」（TTS）与「我的录音」（MediaRecorder 产物）并排回放；
 * recUrl 为 null（录音不可用/尚未评分）时对应按钮禁用。
 * ASR 不支持的浏览器由调用方整体隐藏跟读区块（优雅降级）。
 */
export function RecordingPlayback({
  recUrl,
  onPlayOriginal,
}: {
  recUrl: string | null;
  onPlayOriginal: () => void;
}) {
  const mineRef = useRef<HTMLAudioElement | null>(null);

  function playMine() {
    if (!recUrl) return;
    if (!mineRef.current) mineRef.current = new Audio(recUrl);
    else mineRef.current.currentTime = 0;
    void mineRef.current.play().catch(() => {
      /* 自动播放被拦截时静默 */
    });
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        className="min-h-[40px] px-4 rounded-full bg-green-50 text-green-600 text-xs font-bold hover:bg-green-100"
        onClick={onPlayOriginal}
        aria-label="播放原音"
      >
        🎧 原音
      </button>
      <button
        className={
          "min-h-[40px] px-4 rounded-full text-xs font-bold transition " +
          (recUrl
            ? "bg-purple-50 text-purple-600 hover:bg-purple-100"
            : "bg-gray-50 text-gray-300 cursor-not-allowed")
        }
        onClick={playMine}
        disabled={!recUrl}
        aria-label={recUrl ? "播放我的录音" : "尚无录音"}
      >
        🎙️ 我的录音
      </button>
    </div>
  );
}
