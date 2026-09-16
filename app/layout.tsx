import type { Metadata } from "next";
import "./globals.css";
import { AppStateProvider } from "@/components/AppStateProvider";
import { I18nProvider } from "@/lib/i18n";
import { AppNav } from "@/components/AppNav";
import { AppFooter } from "@/components/AppFooter";
import { Onboarding } from "@/components/Onboarding";
import { ScreenTimeGuard } from "@/components/ScreenTimeGuard";
import { BgmController } from "@/components/BgmController";

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
        {/* AppStateProvider 为状态中枢；I18nProvider 依赖其读取 settings.locale，
            故必须嵌套在其内部（Phase 6 T6-01）。<html lang> 由 I18nProvider 挂载后纠正。 */}
        <AppStateProvider>
          <I18nProvider>
            <AppNav />

            {/* Main Content */}
            <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>

            <AppFooter />

            {/* 首次启动引导 + 时长护眼 + BGM 全局控制（客户端全局层） */}
            <Onboarding />
            <ScreenTimeGuard />
            <BgmController />
          </I18nProvider>
        </AppStateProvider>
      </body>
    </html>
  );
}
