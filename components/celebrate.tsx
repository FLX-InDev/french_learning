"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { playSfx } from "@/lib/audioManager";

/**
 * 星星结算逐颗亮星（PRD §7.3.5 / §7.11.2，Dev-Plan T4.3）：
 * 每颗间隔 420ms 弹出，伴随 star 音效（触发矩阵：0.6s/颗，不可打断）。
 */
export function StarReveal({ stars }: { stars: number }) {
  const [lit, setLit] = useState(0);
  const count = Math.min(3, Math.max(1, Math.round(stars)));

  useEffect(() => {
    setLit(0);
    let n = 0;
    const id = window.setInterval(() => {
      n++;
      setLit(n);
      playSfx("star");
      if (n >= count) window.clearInterval(id);
    }, 420);
    return () => window.clearInterval(id);
  }, [count]);

  return (
    <div
      className="text-5xl tracking-widest"
      role="img"
      aria-label={`${count} 颗星`}
    >
      {[1, 2, 3].map((n) =>
        n <= lit ? (
          <span key={n} className="inline-block animate-[star-pop_0.4s_ease]">
            ⭐
          </span>
        ) : (
          <span key={n} className="opacity-30">
            ☆
          </span>
        )
      )}
    </div>
  );
}

/**
 * 弹窗 spring 缩放入场（PRD §7.3.2，Dev-Plan T4.1）；
 * reduced-motion 下退化为普通容器。
 */
export function PopIn({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.92, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
    >
      {children}
    </motion.div>
  );
}
