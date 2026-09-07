"use client";

import { useState } from "react";

/**
 * 数字键盘大按钮输入（PRD §7.7.4，L3+ 口算闯关）。
 * 触控目标 ≥ 48px；显示当前输入值，由父组件读取并判定。
 */
export function KeypadInput({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "清空", "0", "⌫"];

  function press(k: string) {
    if (disabled) return;
    if (k === "清空") return onChange("");
    if (k === "⌫") return onChange(value.slice(0, -1));
    if (value.length >= 4) return;
    onChange(value + k);
  }

  return (
    <div className="space-y-3">
      <div className="text-center">
        <div
          className="inline-block min-w-[140px] px-6 py-3 rounded-xl border-2 border-purple-200 text-3xl font-extrabold text-gray-800 tabular-nums bg-purple-50"
          aria-live="polite"
          aria-label={`当前输入 ${value || "空"}`}
        >
          {value || <span className="text-gray-300">0</span>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 max-w-[280px] mx-auto">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            disabled={disabled}
            aria-label={k === "⌫" ? "退格" : k}
            className={
              "min-h-[52px] rounded-xl text-xl font-bold transition select-none touch-manipulation " +
              (k === "清空" || k === "⌫"
                ? "bg-gray-100 text-gray-500"
                : "bg-purple-50 text-purple-700 active:bg-purple-200")
            }
          >
            {k}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || !value}
        className="btn-primary w-full max-w-[280px] mx-auto block min-h-[48px]"
      >
        确定
      </button>
    </div>
  );
}
