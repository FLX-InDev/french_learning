import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/AppStateProvider", () => ({ AppStateProvider: "app-state" }));
vi.mock("@/lib/i18n", () => ({ I18nProvider: "i18n-provider" }));
vi.mock("@/components/AppNav", () => ({ AppNav: "app-nav" }));
vi.mock("@/components/AppFooter", () => ({ AppFooter: "app-footer" }));
vi.mock("@/components/Onboarding", () => ({ Onboarding: "onboarding" }));
vi.mock("@/components/ScreenTimeGuard", () => ({ ScreenTimeGuard: "screen-time" }));
vi.mock("@/components/BgmController", () => ({ BgmController: "bgm" }));

import LocaleLayout, { generateStaticParams } from "./layout";

describe("locale root layout", () => {
  it.each(["zh", "en", "fr"])("renders %s as the server HTML language", (locale) => {
    const root = LocaleLayout({ children: "content", params: { locale } }) as ReactElement;
    expect(root.type).toBe("html");
    expect(root.props.lang).toBe(locale);
    expect(root.props.children.type).toBe("body");
  });

  it("keeps all supported locales statically generated", () => {
    expect(generateStaticParams()).toEqual([{ locale: "zh" }, { locale: "en" }, { locale: "fr" }]);
  });

  it("rejects unsupported locales", () => {
    expect(() => LocaleLayout({ children: "content", params: { locale: "de" } })).toThrow("NOT_FOUND");
  });
});
