"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAppState } from "./AppStateProvider";
import { ParentGate } from "./ParentGate";
import { DailyChallenge } from "./DailyChallenge";
import { Mascot } from "./Mascot";
import type { ContentType, AlphabetCard, Word } from "@/lib/contentTypes";
import type { Sentence, Story } from "@/lib/parser";
import { getLevelConfig, levelLabel } from "@/lib/levels";
import type { ContentStats } from "@/lib/parser";

/** 学科入口：ready=false 表示页面尚未落地，为占位禁用态 */
const ENTRIES: {
  key: string;
  emoji: string;
  name: string;
  desc: string;
  href: string;
  ready: boolean;
  dependsOn: ContentType[];
}[] = [
  {
    key: "language",
    emoji: "💬",
    name: "语言",
    desc: "句子 · 故事",
    href: "/sentences",
    ready: true,
    dependsOn: ["sentence", "story"],
  },
  {
    key: "alphabet",
    emoji: "🔤",
    name: "字母拼写",
    desc: "字母表 · 拼词",
    href: "/alphabets",
    ready: true, // Phase 3 上线
    dependsOn: ["alphabet"],
  },
  {
    key: "word",
    emoji: "🃏",
    name: "词汇",
    desc: "图鉴 · 闪卡 · 跟读",
    href: "/words",
    ready: true, // Phase 5A 上线
    dependsOn: ["word"],
  },
  {
    key: "math",
    emoji: "🔢",
    name: "数学",
    desc: "数与量 · 加减法",
    href: "/math",
    ready: true, // Phase 2 上线
    dependsOn: ["math"],
  },
  {
    key: "logic",
    emoji: "🧩",
    name: "逻辑",
    desc: "找规律 · 分类",
    href: "/logic",
    ready: true, // Phase 2 上线
    dependsOn: ["logic"],
  },
  {
    key: "song",
    emoji: "🎵",
    name: "音乐",
    desc: "儿歌卡拉OK",
    href: "/songs",
    ready: true, // Phase 3 上线
    dependsOn: ["song"],
  },
];

const GREETINGS = [
  { zh: "你好！", en: "Hello!", fr: "Bonjour !" },
  { zh: "我们一起学法语吧！", en: "Let's learn French!", fr: "Apprenons le français !" },
  { zh: "今天也要加油哦！", en: "You can do it!", fr: "Allez, courage !" },
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
  const [greet, setGreet] = useState(GREETINGS[0]);
  const [gateOpen, setGateOpen] = useState(false);

  // 首屏问候随机（放在 effect 中，避免服务端/客户端渲染不一致）
  useEffect(() => {
    setGreet(GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
  }, []);

  const hidden = state?.settings.hiddenContent ?? [];
  const level = state?.profile.level ?? "L3";
  const cfg = getLevelConfig(level);

  const visibleEntries = ENTRIES.filter((e) => {
    const inManifest = e.dependsOn.some((t) => enabled.includes(t));
    const allHidden = e.dependsOn.every((t) => hidden.includes(t));
    return inManifest && !allHidden;
  });

  return (
    <div className="space-y-10">
      {/* Hero：Félix 问候 + 学段徽标 + 星星徽标（T4.3） */}
      <section className="text-center py-8">
        <Mascot mood="idle" size={120} className="mx-auto" />
        <h1 className="text-3xl md:text-4xl font-bold mt-3">
          <span className="bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 bg-clip-text text-transparent">
            法语宝宝学
          </span>
        </h1>
        <p className="text-gray-500 mt-2">{greet.fr}</p>
        <p className="text-gray-400 text-sm">
          {greet.zh} · {greet.en}
        </p>

        <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
          <button
            onClick={() => setGateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-50 text-purple-700 font-semibold text-sm hover:bg-purple-100 min-h-[48px]"
            aria-label="切换学习阶段（需家长验证）"
          >
            <span className="text-lg">{cfg.emoji}</span>
            {levelLabel(level)}
            <span className="text-xs text-purple-400">点击切换</span>
          </button>
          <span
            className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-amber-50 text-amber-600 font-bold text-sm"
            title="累计星星（数学关卡与每日挑战获得）"
          >
            ⭐ {state?.rewards.stars ?? 0}
          </span>
        </div>
      </section>

      {/* 今日任务卡 */}
      <section className="bg-white rounded-2xl shadow-sm border border-purple-100 p-5">
        <h2 className="text-lg font-bold text-gray-800 mb-3">📅 今日任务</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DailyChallenge
            pool={pool}
            words={words}
            alphabets={alphabets}
          />
          <Link
            href="/sentences"
            className="rounded-xl bg-purple-50 p-4 hover:bg-purple-100 transition"
          >
            <div className="font-bold text-gray-800">今日一句</div>
            <div className="text-xs text-gray-500 mt-1">
              点开句子库，跟着 Félix 读三语
            </div>
            <div className="mt-3 text-purple-600 text-sm font-semibold">
              开始学习 →
            </div>
          </Link>
        </div>
      </section>

      {/* 学科入口 2×3 */}
      <section>
        <h2 className="text-2xl font-bold text-gray-700 mb-4 flex items-center gap-2">
          <span className="text-purple-500">✨</span> 学科入口
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {visibleEntries.map((e) => {
            const body = (
              <>
                <div className="text-4xl">{e.emoji}</div>
                <div className="mt-2 font-bold text-gray-800">{e.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{e.desc}</div>
                {!e.ready && (
                  <div className="mt-2 text-[11px] text-gray-400">
                    即将上线
                  </div>
                )}
              </>
            );
            const cls =
              "block bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center transition " +
              (e.ready ? "hover:shadow-md hover:-translate-y-0.5" : "opacity-60");
            return e.ready ? (
              <Link key={e.key} href={e.href} className={cls}>
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
          href="/stories"
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center hover:shadow-md transition"
        >
          <div className="text-3xl">📖</div>
          <div className="mt-2 font-bold text-gray-800">三语故事</div>
        </Link>
        <Link
          href="/workspace"
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center hover:shadow-md transition"
        >
          <div className="text-3xl">📊</div>
          <div className="mt-2 font-bold text-gray-800">学习中心</div>
        </Link>
      </section>

      {/* 动态统计（BUG-2 关闭：不再硬编码） */}
      <section className="bg-white/60 backdrop-blur-sm rounded-2xl p-8 border border-purple-100">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          <Stat n={stats.sentence} label="常用句子" color="text-purple-600" />
          <Stat n={stats.story} label="趣味故事" color="text-pink-500" />
          <Stat n={stats.word} label="词卡" color="text-blue-500" />
          <Stat n={stats.song} label="儿歌" color="text-orange-500" />
          <Stat n={stats.alphabet} label="字母卡" color="text-green-600" />
        </div>
      </section>

      {/* 家长中心入口 */}
      <section className="text-center pb-4">
        <button
          onClick={() => setGateOpen(true)}
          className="text-sm text-gray-400 hover:text-purple-600 inline-flex items-center gap-1 min-h-[48px]"
        >
          🔒 家长中心
        </button>
      </section>

      {gateOpen && (
        <ParentGate
          title="家长中心"
          onPass={() => {
            setGateOpen(false);
            window.location.href = "/parents";
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
