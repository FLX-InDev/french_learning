"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePrefersReducedMotion } from "./useMotionPrefs";
import { useI18n } from "@/lib/i18n";

// Lottie 渲染器懒加载（不阻塞 LCP；加载失败静默降级 emoji）
const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), {
  ssr: false,
  loading: () => null,
});

// JSON 动画数据模块级缓存（同一 mood 只拉取一次）
const cache = new Map<string, object>();

export type MascotMood = "idle" | "happy" | "encourage";

/**
 * 吉祥物 Félix（PRD §7.3.1，Dev-Plan T4.1）：
 * - 三态 Lottie（idle 呼吸 / happy 弹跳 / encourage 摇头鼓励），JSON 懒加载（每个 ~4KB）；
 * - 加载失败 / 不支持 / prefers-reduced-motion 时降级为静态 emoji 🦊，不留白（出口标准）；
 * - 固定尺寸容器，无 CLS。
 */
export function Mascot({
  mood = "idle",
  size = 96,
  className = "",
}: {
  mood?: MascotMood;
  size?: number;
  className?: string;
}) {
  const { t } = useI18n();
  const reduced = usePrefersReducedMotion();
  const [data, setData] = useState<object | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (reduced) return; // 减少动态：直接静态 emoji
    let alive = true;
    const key = `felix-${mood}`;
    const cached = cache.get(key);
    if (cached) {
      setData(cached);
      return;
    }
    fetch(`/lottie/${key}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((json: object) => {
        cache.set(key, json);
        if (alive) setData(json);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [mood, reduced]);

  const showLottie = !reduced && !failed && data !== null;

  return (
    <div
      className={"inline-flex items-center justify-center " + className}
      style={{ width: size, height: size }}
      aria-hidden="true"
      data-mood={mood}
    >
      {showLottie ? (
        <Lottie
          src={data}
          loop
          autoplay
          className="w-full h-full"
        />
      ) : (
        <span
          className="select-none"
          style={{ fontSize: size * 0.78, lineHeight: 1 }}
          role="img"
          aria-label={t('mascot.name')}
        >
          🦊
        </span>
      )}
    </div>
  );
}
