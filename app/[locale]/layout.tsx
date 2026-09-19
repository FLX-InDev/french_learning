import type { Metadata } from "next";
import { AppStateProvider } from "@/components/AppStateProvider";
import { I18nProvider } from "@/lib/i18n";
import { AppNav } from "@/components/AppNav";
import { AppFooter } from "@/components/AppFooter";
import { Onboarding } from "@/components/Onboarding";
import { ScreenTimeGuard } from "@/components/ScreenTimeGuard";
import { BgmController } from "@/components/BgmController";
import { UI_LOCALES } from "@/lib/localeRoute";
import { pageMeta } from "@/lib/metaDict";

/**
 * 语言路由布局（C1 方案①）：/zh、/en、/fr 三套前缀。
 * 语言唯一真源 = URL 段 `[locale]`；语言切换器改写地址栏前缀，
 * Provider 仍把设置里的 locale 同步落库（localStorage + cookie），供旧地址重定向兜底。
 */
export function generateStaticParams() {
  return UI_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return pageMeta(params.locale, "meta.home");
}

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  return (
    <AppStateProvider>
      <I18nProvider initialLocale={params.locale}>
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
  );
}
