"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 家长门（PRD §7.12.2 F45）
 * 长按按钮 3 秒 + 随机两位数加法题；答错可重试。
 * 通过后回调 onPass（由调用方决定进入家长中心或解锁某项操作）。
 */

const HOLD_MS = 3000;

function makeQuestion() {
  const a = 10 + Math.floor(Math.random() * 40); // 10–49
  const b = 10 + Math.floor(Math.random() * 40);
  return { a, b, answer: a + b };
}

export function ParentGate({
  onPass,
  onCancel,
  title = "家长中心",
  hint,
}: {
  onPass: () => void;
  onCancel?: () => void;
  title?: string;
  hint?: string;
}) {
  const [step, setStep] = useState<"hold" | "math">("hold");
  const [progress, setProgress] = useState(0);
  const [q, setQ] = useState(() => makeQuestion());
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);

  const stopHold = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setProgress(0);
  }, []);

  useEffect(() => stopHold, [stopHold]);

  const startHold = useCallback(() => {
    if (step !== "hold") return;
    startRef.current = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - startRef.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        stopHold();
        setStep("math");
        setQ(makeQuestion());
        setInput("");
        setError("");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [step, stopHold]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (Number(input.trim()) === q.answer) {
      onPass();
      return;
    }
    setError("答案不对，再试一次吧");
    setInput("");
    setQ(makeQuestion());
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-gray-900/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">🔒 {title}</h2>
          {onCancel && (
            <button
              onClick={onCancel}
              className="text-sm text-gray-400 hover:text-gray-600 px-2 py-1"
              aria-label="关闭家长门"
            >
              ✕
            </button>
          )}
        </div>

        {step === "hold" ? (
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-4">
              {hint ?? "请长按下方按钮 3 秒，验证家长身份"}
            </p>
            <button
              onPointerDown={startHold}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onContextMenu={(e) => e.preventDefault()}
              className="relative w-40 h-40 mx-auto rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white font-bold text-lg select-none touch-none active:scale-95 transition-transform"
              aria-label="长按 3 秒进行家长验证"
            >
              <span
                className="absolute inset-0 rounded-full bg-white/30"
                style={{
                  clipPath: `inset(${(1 - progress) * 100}% 0 0 0)`,
                }}
              />
              <span className="relative">长按 3 秒</span>
            </button>
            <p className="text-xs text-gray-400 mt-3">松开即取消</p>
          </div>
        ) : (
          <form onSubmit={submit} className="text-center">
            <p className="text-sm text-gray-500 mb-4">
              请回答：验证通过后即可继续
            </p>
            <div className="text-3xl font-extrabold text-purple-600 mb-4">
              {q.a} + {q.b} = ?
            </div>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              autoFocus
              className="w-40 mx-auto text-center text-2xl font-bold border-2 border-purple-200 rounded-xl px-3 py-2 outline-none focus:border-purple-500"
              aria-label="请输入算式答案"
            />
            {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
            <button
              type="submit"
              className="btn-primary mt-4 w-full"
              disabled={!input}
            >
              确定
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
