"use client";

/**
 * 全局错误边界（B6 工程加固）
 * 任何路由渲染抛错时兜底，保证「不白屏」（走查清单 A7 语义）。
 * 提供重试（恢复渲染）与回首页两条出路。
 */

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="min-h-[60vh] flex items-center justify-center p-6"
      role="alert"
    >
      <div className="bg-white/90 backdrop-blur rounded-3xl p-8 max-w-md w-full text-center shadow-xl">
        <div className="text-5xl">🦊</div>
        <h2 className="text-xl font-bold text-gray-800 mt-3">
          哎呀，出了点小问题
        </h2>
        <p className="text-sm text-gray-500 mt-2">
          Félix 也找不到路啦，再试一次好吗？
        </p>
        {process.env.NODE_ENV === "development" && (
          <pre className="mt-3 text-xs text-left text-gray-400 bg-gray-50 rounded-xl p-3 overflow-auto max-h-32">
            {error.message}
          </pre>
        )}
        <div className="flex flex-col gap-2 mt-6">
          <button className="btn-primary" onClick={() => reset()}>
            再试一次
          </button>
          <a className="btn-secondary" href="/">
            回首页
          </a>
        </div>
      </div>
    </div>
  );
}
