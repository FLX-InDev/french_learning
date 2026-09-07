"use client";

import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "./useMotionPrefs";

const COLORS = ["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899"];

/** 24 片彩纸的确定性布局（索引驱动，避免每次渲染跳动） */
const PIECES = Array.from({ length: 24 }, (_, i) => ({
  left: `${(i * 41 + 7) % 100}%`,
  delay: `${(i % 8) * 90}ms`,
  duration: `${1100 + ((i * 137) % 400)}ms`,
  color: COLORS[i % COLORS.length],
  size: 8 + ((i * 13) % 7),
  drift: ((i * 29) % 60) - 30,
}));

/**
 * 撒花庆祝（PRD §7.3.4，Dev-Plan T4.1/F50）：
 * - 纯 CSS 实现（PRD 允许 CSS/Canvas），≤1.5s 自动结束（fire 后 1600ms 卸载）；
 * - 全屏 fixed 覆盖，pointer-events-none，无 CLS；
 * - prefers-reduced-motion 下不渲染（出口标准）。
 */
export function useConfetti(): { active: boolean; fire: () => void } {
  const [active, setActive] = useState(false);
  const reduced = usePrefersReducedMotion();
  return {
    active: active && !reduced,
    fire: () => {
      if (reduced) return;
      setActive(true);
    },
  };
}

export function Confetti({ active }: { active: boolean }) {
  const reduced = usePrefersReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active || reduced) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), 1600);
    return () => window.clearTimeout(id);
  }, [active, reduced]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[120] pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      {PIECES.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-[2px]"
          style={{
            left: p.left,
            top: -20,
            width: p.size,
            height: p.size * 1.5,
            backgroundColor: p.color,
            animation: `confetti-fall ${p.duration} ease-in ${p.delay} forwards`,
            ["--confetti-drift" as string]: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
