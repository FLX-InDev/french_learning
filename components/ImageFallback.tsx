import { useState, useCallback, type ReactNode } from "react";

/**
 * 统一图片组件（PRD §10.2 / G-6）
 * - 加载失败自动降级为 `fallback`（emoji 或任意 React 节点），不留白
 * - 固定尺寸容器防 CLS
 * - `lazy` 为 true 时设 `loading="lazy"` + `decoding="async"`（非首屏图片）
 * - 零新依赖（G-4）
 */
export function ImageFallback({
  src,
  alt = "",
  fallback,
  size = 64,
  lazy = false,
  className = "",
  eager = false,
}: {
  /** 图片 src（如 "/images/icons/math.svg"） */
  src: string;
  alt?: string;
  /** 加载失败时显示的降级内容（emoji 字符或 ReactNode） */
  fallback: ReactNode;
  /** 渲染尺寸（px），同时作为容器固定宽高（防 CLS） */
  size?: number;
  /** 懒加载（非首屏图片） */
  lazy?: boolean;
  className?: string;
  /** 强制立即加载（首屏 LCP 区域设为 true，忽略 lazy） */
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const handleError = useCallback(() => setFailed(true), []);

  const shouldLazy = lazy && !eager;

  if (failed) {
    return (
      <span
        className={`inline-flex items-center justify-center ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.6, lineHeight: 1 }}
        role="img"
        aria-label={alt}
      >
        {fallback}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={alt}
    >
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading={shouldLazy ? "lazy" : undefined}
        decoding="async"
        onError={handleError}
        className="h-full w-full object-contain"
      />
    </span>
  );
}
