import type { Metadata } from "next";
import "./globals.css";

/**
 * 根布局：只负责 <html>/<body> 与全局样式；
 * 语言化布局（Provider / 导航 / metadata）下沉到 app/[locale]/layout.tsx（C1 方案①：语言路由）。
 * `<html lang>` 静态 zh，挂载后由 I18nProvider 按路由语言纠正（无 hydration 差异）。
 */
export const viewport = { width: "device-width", initialScale: 1 };

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
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
