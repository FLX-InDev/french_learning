"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useSyncExternalStore, type ReactNode } from "react";

const subscribe = () => () => {};

export default function Template({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const clientNavigation = useSyncExternalStore(subscribe, () => true, () => false);
  return (
    <motion.div
      // Keep server content visible before hydration; animate subsequent client mounts only.
      initial={clientNavigation && !reduce ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.18, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
