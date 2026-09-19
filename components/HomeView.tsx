"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useAppState } from "./AppStateProvider";
import { ParentGate } from "./ParentGate";
import { Mascot } from "./Mascot";
import { useI18n, localizedHref } from "@/lib/i18n";
import { ImageFallback } from "./ImageFallback";
import { SUBJECT_ICONS, SUBJECT_EMOJI_FALLBACK, type SubjectIconKey } from "@/lib/imageAssets";
import type { ContentType, AlphabetCard, Word } from "@/lib/contentTypes";
import type { Sentence, Story } from "@/lib/parser";
import { getLevelConfig, levelLabel } from "@/lib/levels";
import type { ContentStats } from "@/lib/parser";

/** B6 工程加固：今日任务卡为重组件（测验引擎+玩法扩展），动态分割以降低首页首屏 JS */
const DailyChallenge = dynamic(() => import("./DailyChallenge").then((m) => m.DailyChallenge), {
  ssr: false,
  loading: () => (
    <div className="h-40 rounded-xl bg-purple-50 animate-pulse flex items-center justify-center text-purple-300 text-sm">
      𞲷 home.loading
    </div>
  ),
});

/** 学科入口 key → 图标 key 映射 */
const ENTRY_ICON_MAP: Record<string, SubjectIconKey> = {
  language: "dialogue",
  alphabet: "spelling",
  word: "words",
  math: "math",
  logic: "logic",
  song: "music",
};

const GREETINGS = [
  { zh: "你好！", en: "Hello!", fr: "Bonjour !" },
  { zh: "我们一起学法语吧！", en: "Let's learn French!", fr: "Apprenons le français !" },
  { zh: "今天也要加油哦！", en: "You can do it!", fr: "Allez, courage !" },
];

/** 问候语三语顺序：主行按界面语言，副行显示另外两种 */
const GREETING_ORDER = ["zh", "en", "fr"] as const;

/** 学科入口：ready=false 表示页面尚未落地，为占位禁用态 */
const ENTRIES: {
  key: string;
  emoji: string;
  nameKey: string;
  desc: string;
  href: string;
  ready: boolean;
  dependsOn: ContentType[];
}[] = [
  {
    key: "language",
    emoji: "💬",
    nameKey: "home.subjects.language",
    desc: "home.subjects.languageDesc",
    href: "/sentences",
    ready: true,
    dependsOn: ["sentence", "story"],
  },
  {
    key: "alphabet",
    emoji: "🔤",
    nameKey: "home.subjects.spelling",
    desc: "home.subjects.alphabetDesc",
    href: "/alphabets",
    ready: true,
    dependsOn: ["alphabet"],
  },
  {
    key: "word",
    emoji: "🃏",
    nameKey: "home.subjects.vocabulary",
    desc: "home.subjects.wordDesc",
    href: "/words",
    ready: true,
    dependsOn: ["word"],
  },
  {
    key: "math",
    emoji: "🔢",
    nameKey: "home.subjects.math",
    desc: "home.subjects.mathDesc",
    href: "/math",
    ready: true,
    dependsOn: ["math"],
  },
  {
    key: "logic",
    emoji: "🧩",
    nameKey: "home.subjects.logic",
    desc: "home.subjects.logicDesc",
    href: "/logic",
    ready: true,
    dependsOn: ["logic"],
  },
  {
    key: "song",
    emoji: "🎵",
    nameKey: "home.subjects.music",
    desc: "home.subjects.songDesc",
    href: "/songs",
    ready: true,
    dependsOn: ["song"],
  },
];

export function HomeView({
  stats,
  enabled,
  pool,
  words,
  alphabets,
}: {
  stats: ContentStats;
  enabled: ContentType[];
  /** 语言出题池（服务端 buildPool 构建后注入，避免 fs 进入客户端包） */
  pool: Sentence[];
  words: Word[];
  alphabets: AlphabetCard[];
}) {
  const { state } = useAppState();
  const { t, locale } = useI18n();
  const [greet, setGreet] = useState(GREETINGS[0]);
  const [gateOpen, setGateOpen] = useState(false);

  // 首屏问候随机（放在 effect 中，避免服务端/客户端渲染不一致）
  useEffect(() => {
    setGreet(GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
  }, []);

  const hidden = state?.settings.hiddenContent ?? [];
  const level = state?.profile.level ?? "L3";
  const cfg = getLevelConfig(level);

  const visibleEntries = useMemo(
    () =>
      ENTRIES.filter((e) => {
        const inManifest = e.dependsOn.some((t) => enabled.includes(t));
        const allHidden = e.dependsOn.every((t) => hidden.includes(t));
        return inManifest && !allHidden;
      }),
    [enabled, hidden]
  );

  return (
    <div className="space-y-10">
      {/* Hero：Félix 问候 + 学段徽标 + 星星徽标（T4.3） */}
      <section className="text-center py-8">
        <Mascot mood="idle" size={120} className="mx-auto" />
        <h1 className="text-3xl md:text-4xl font-bold mt-3">
          <span className="bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 bg-clip-text text-transparent">
            {t('home.brand')}
          </span>
        </h1>
        <p className="text-gray-500 mt-2">{greet[locale]}</p>
        <p className="text-gray-400 text-sm">
          {GREETING_ORDER.filter((l) => l !== locale)
            .map((l) => greet[l])
            .join(" · ")}
        </p>

        <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
          <button
            onClick={() => setGateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-50 text-purple-700 font-semibold text-sm hover:bg-purple-100 min-h-[48px]"
            aria-label={t("home.switchStageAria")}
          >
            <span className="text-lg">{cfg.emoji}</span>
            {levelLabel(level, locale)}
          <span className="text-xs text-purple-400">{t('home.clickToSwitch')}</span>
          </button>
          <span
            className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-amber-50 text-amber-600 font-bold text-sm"
            title={t("home.starsTooltip")}
          >
            ⭐ {state?.rewards.stars ?? 0}
          </span>
        </div>
      </section>

      {/* 今日任务卡 */}
      <section className="bg-white rounded-2xl shadow-sm border border-purple-100 p-5">
        <h2 className="text-lg font-bold text-gray-800 mb-3">{t('home.todayTasks')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DailyChallenge
            pool={pool}
            words={words}
            alphabets={alphabets}
          />
          <Link
            href={localizedHref(locale, "/sentences")}
            className="rounded-xl bg-purple-50 p-4 hover:bg-purple-100 transition"
          >
            <div className="font-bold text-gray-800">{t('home.todaySentence.title')}</div>
            <div className="text-xs text-gray-500 mt-1">
              {t('home.todaySentence.desc')}
            </div>
            <div className="mt-3 text-purple-600 text-sm font-semibold">
              {t('home.todaySentence.cta')}
            </div>
          </Link>
        </div>
      </section>

      {/* 学科入口 2×3 */}
      <section>
        <h2 className="text-2xl font-bold text-gray-700 mb-4 flex items-center gap-2">
          <span className="text-purple-500">✨</span>{t('home.subjects.title')}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {visibleEntries.map((e) => {
            const iconKey = ENTRY_ICON_MAP[e.key] ?? "dialogue";
            const body = (
              <>
                <ImageFallback
                  src={SUBJECT_ICONS[iconKey]}
                  alt={t(e.nameKey)}
                  fallback={SUBJECT_EMOJI_FALLBACK[iconKey]}
                  size={96}
                  eager
                />
                <div className="mt-2 font-bold text-gray-800">{t(e.nameKey)}</div>
                <div className="text-xs text-gray-500 mt-0.5">{t(e.desc)}</div>
                {!e.ready && (
                  <div className="mt-2 text-[11px] text-gray-400">
                    {t('home.comingSoon')}
                  </div>
                )}
              </>
            );
            const cls =
              "block bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center transition " +
              (e.ready ? "hover:shadow-md hover:-translate-y-0.5" : "opacity-60");
            return e.ready ? (
              <Link key={e.key} href={localizedHref(locale, e.href)} className={cls}>
                {body}
              </Link>
            ) : (
              <div key={e.key} className={cls} aria-disabled="true">
                {body}
              </div>
            );
          })}
        </div>
      </section>

      {/* 更多入口 */}
      <section className="grid grid-cols-2 gap-4">
        <Link
          href={localizedHref(locale, "/stories")}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center hover:shadow-md transition"
        >
          <div className="text-3xl">📖</div>
          <div className="mt-2 font-bold text-gray-800">{t('home.stories')}</div>
        </Link>
        <Link
          href={localizedHref(locale, "/workspace")}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center hover:shadow-md transition"
        >
          <div className="text-3xl">📊</div>
          <div className="mt-2 font-bold text-gray-800">{t('home.workspace')}</div>
        </Link>
      </section>

      {/* 动态统计（BUG-2 关闭：不再硬编码） */}
      <section className="bg-white/60 backdrop-blur-sm rounded-2xl p-8 border border-purple-100">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          <Stat n={stats.sentence} label={t('home.stats.sentences')} color="text-purple-600" />
          <Stat n={stats.story} label={t('home.stats.stories')} color="text-pink-500" />
          <Stat n={stats.word} label={t('home.stats.flashcards')} color="text-blue-500" />
          <Stat n={stats.song} label={t('home.stats.songs')} color="text-orange-500" />
          <Stat n={stats.alphabet} label={t('home.stats.alphabets')} color="text-green-600" />
        </div>
      </section>

      {/* 家长中心入口 */}
      <section className="text-center pb-4">
        <button
          onClick={() => setGateOpen(true)}
          className="text-sm text-gray-400 hover:text-purple-600 inline-flex items-center gap-1 min-h-[48px]"
        >
          {t('home.parentsBadge')}
        </button>
      </section>

      {gateOpen && (
        <ParentGate
          title={t('home.parentsModal.title')}
          onPass={() => {
            setGateOpen(false);
            window.location.href = localizedHref(locale, "/parents");
          }}
          onCancel={() => setGateOpen(false)}
        />
      )}

    </div>
  );
}

function Stat({
  n,
  label,
  color,
}: {
  n: number;
  label: string;
  color: string;
}) {
  return (
    <div>
      <div className={"text-3xl font-bold " + color}>{n}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}
