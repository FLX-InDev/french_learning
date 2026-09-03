import type { Metadata } from "next";
import "./globals.css";

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
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Noto+Sans:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">
        {/* Navigation */}
        <nav className="sticky top-0 z-50 backdrop-blur-md bg-white/70 border-b border-purple-100 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <a
              href="/"
              className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
            >
              🇫🇷 法语宝宝学
            </a>
            <div className="flex gap-4 text-sm font-medium">
              <a
                href="/sentences"
                className="text-gray-600 hover:text-purple-600 transition-colors px-3 py-1.5 rounded-full hover:bg-purple-50"
              >
                📝 句子
              </a>
              <a
                href="/stories"
                className="text-gray-600 hover:text-purple-600 transition-colors px-3 py-1.5 rounded-full hover:bg-purple-50"
              >
                📖 故事
              </a>
              <a
                href="/workspace"
                className="text-gray-600 hover:text-purple-600 transition-colors px-3 py-1.5 rounded-full hover:bg-purple-50"
              >
                📊 工作台
              </a>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>

        {/* Footer */}
        <footer className="text-center py-8 text-sm text-gray-400">
          <p>法语宝宝学 · Bébé apprend le français</p>
          <p className="mt-1">中英法三语对照 · 快乐学习每一天</p>
        </footer>
      </body>
    </html>
  );
}
