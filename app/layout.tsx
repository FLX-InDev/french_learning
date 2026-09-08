import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { AppStateProvider } from "@/components/AppStateProvider";
import { Onboarding } from "@/components/Onboarding";
import { ScreenTimeGuard } from "@/components/ScreenTimeGuard";

export const metadata: Metadata = {
  title: "法语宝宝学 - Bébé apprend le français",
  description: "中英法三语对照的幼儿法语学习网站",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh">
      <head>
        {/* B3：移除 Google Fonts 外链（渲染阻塞 1.9s + CJK 字库 871KB），
            改用系统字体栈（见 globals.css），符合「无外链」的隐私合规目标。 */}
      </head>
      <body className="min-h-screen">
        <AppStateProvider>
          {/* Navigation */}
          <nav className="sticky top-0 z-50 backdrop-blur-md bg-white/70 border-b border-purple-100 shadow-sm">
            <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
              <Link
                href="/"
                className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
              >
                🇫🇷 法语宝宝学
              </Link>
              <div className="flex gap-2 text-sm font-medium">
                <Link
                  href="/sentences"
                  className="text-gray-600 hover:text-purple-600 transition-colors px-3 py-1.5 rounded-full hover:bg-purple-50"
                >
                  📝 句子
                </Link>
                <Link
                  href="/stories"
                  className="text-gray-600 hover:text-purple-600 transition-colors px-3 py-1.5 rounded-full hover:bg-purple-50"
                >
                  📖 故事
                </Link>
                <Link
                  href="/alphabets"
                  className="text-gray-600 hover:text-purple-600 transition-colors px-3 py-1.5 rounded-full hover:bg-purple-50"
                >
                  🔤 字母
                </Link>
                <Link
                  href="/songs"
                  className="text-gray-600 hover:text-purple-600 transition-colors px-3 py-1.5 rounded-full hover:bg-purple-50"
                >
                  🎵 儿歌
                </Link>
                <Link
                  href="/math"
                  className="text-gray-600 hover:text-purple-600 transition-colors px-3 py-1.5 rounded-full hover:bg-purple-50"
                >
                  🔢 数学
                </Link>
                <Link
                  href="/logic"
                  className="text-gray-600 hover:text-purple-600 transition-colors px-3 py-1.5 rounded-full hover:bg-purple-50"
                >
                  🧩 逻辑
                </Link>
                <Link
                  href="/workspace"
                  className="text-gray-600 hover:text-purple-600 transition-colors px-3 py-1.5 rounded-full hover:bg-purple-50"
                >
                  📊 学习中心
                </Link>
                <Link
                  href="/parents"
                  className="text-gray-600 hover:text-purple-600 transition-colors px-3 py-1.5 rounded-full hover:bg-purple-50"
                >
                  🔒 家长
                </Link>
              </div>
            </div>
          </nav>

          {/* Main Content */}
          <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>

          {/* Footer */}
          <footer className="text-center py-8 text-sm text-gray-400">
            <p>法语宝宝学 · Bébé apprend le français</p>
            <p className="mt-1">
              中英法三语对照 · 快乐学习每一天 ·{" "}
              <Link href="/privacy" className="hover:text-purple-500 underline">
                隐私声明
              </Link>
            </p>
          </footer>

          {/* 首次启动引导 + 时长护眼（客户端全局层） */}
          <Onboarding />
          <ScreenTimeGuard />
        </AppStateProvider>
      </body>
    </html>
  );
}
