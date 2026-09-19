"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * 路由转场（PRD §7.3.2，Dev-Plan T4.1）：
 * template.tsx 在导航时重新挂载 → 淡入上滑 180ms（150–200ms 规格区间）；
 * prefers-reduced-motion 下不包 motion 容器（出口标准：无转场、功能完好）。
 */
export default function Template({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
