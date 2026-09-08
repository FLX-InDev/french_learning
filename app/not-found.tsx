import Link from "next/link";

/** 404 兜底页（B6 工程加固）：保持产品语气，提供回首页出路 */
export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="bg-white/90 backdrop-blur rounded-3xl p-8 max-w-md w-full text-center shadow-xl">
        <div className="text-5xl">🔍</div>
        <h2 className="text-xl font-bold text-gray-800 mt-3">
          这里什么都没有哦
        </h2>
        <p className="text-sm text-gray-500 mt-2">
          页面不存在或已被移走，回首页继续学习吧！
        </p>
        <Link href="/" className="btn-primary mt-6 inline-block">
          回首页
        </Link>
      </div>
    </div>
  );
}
