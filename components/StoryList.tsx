"use client";

import Link from "next/link";
import { useAppState } from "@/components/AppStateProvider";
import { matchesLevel } from "@/lib/contentTypes";
import type { Story } from "@/lib/parser";

const COLORS = [
  "from-pink-400 to-rose-400",
  "from-purple-400 to-indigo-400",
  "from-blue-400 to-cyan-400",
  "from-green-400 to-emerald-400",
  "from-yellow-400 to-amber-400",
  "from-orange-400 to-red-400",
  "from-teal-400 to-cyan-400",
  "from-indigo-400 to-purple-400",
];

const EMOJIS = ["🐰", "🐻", "🐦", "🐶", "🐱", "🐷", "🐑", "🦆"];

/**
 * 故事列表（软切换：按 AppState.profile.level 即时过滤）
 */
export function StoryList({ stories }: { stories: Story[] }) {
  const { state } = useAppState();
  const level = state?.profile.level ?? "L3";
  const hidden = state?.settings.hiddenContent ?? [];

  if (hidden.includes("story")) {
    return (
      <div className="text-center text-gray-400 py-10">
        该内容已被家长关闭，可在家长中心重新开启。
      </div>
    );
  }

  const list = stories.filter((s) => matchesLevel(s.level, level));

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-500">
        当前学段可见 {list.length} / {stories.length} 个故事
      </div>

      {list.length === 0 ? (
        <div className="text-center text-gray-400 py-10">
          当前学段暂无故事，可在家长中心切换学段。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {list.map((story, index) => (
            <Link key={story.id} href={`/stories/${story.id}`} className="group">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <div
                  className={`h-24 bg-gradient-to-br ${
                    COLORS[index % COLORS.length]
                  } flex items-center justify-center`}
                >
                  <span className="text-4xl">
                    {story.emoji || EMOJIS[index % EMOJIS.length]}
                  </span>
                </div>
                <div className="p-5">
                  <h2 className="text-lg font-bold text-gray-800 group-hover:text-purple-600 transition-colors">
                    {story.title}
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">
                    {story.sentences.length} 句话 · 三语对照
                  </p>
                  <div className="mt-3 text-purple-500 text-sm font-medium">
                    阅读故事 →
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
