"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "@/components/AppStateProvider";
import { matchesLevel } from "@/lib/contentTypes";
import type { Story } from "@/lib/parser";
import { ImageFallback } from "./ImageFallback";
import { STORY_COVERS, STORY_EMOJI_FALLBACK } from "@/lib/imageAssets";

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
const STORY_KEYS = ["rabbit", "bear", "bird", "dog", "cat", "pig", "sheep", "duck"];

/**
 * 故事列表（软切换：按 AppState.profile.level 即时过滤）
 */
export function StoryList({ stories }: { stories: Story[] }) {
  const { t } = useI18n();
  const { state } = useAppState();
  const level = state?.profile.level ?? "L3";
  const hidden = state?.settings.hiddenContent ?? [];

  if (hidden.includes("story")) {
    return (
      <div className="text-center text-gray-400 py-10">
        {t("story.parentLocked")}
      </div>
    );
  }

  const list = stories.filter((s) => matchesLevel(s.level, level));

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-500">
        {t("story.count", { current: String(list.length), total: String(stories.length) })}
      </div>

      {list.length === 0 ? (
        <div className="text-center text-gray-400 py-10">
          {t("story.empty")}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {list.map((story, index) => {
            const storyKey = STORY_KEYS[index % STORY_KEYS.length];
            const coverSrc = STORY_COVERS[storyKey] ?? "";
            const coverFallback = STORY_EMOJI_FALLBACK[storyKey] ?? EMOJIS[index % EMOJIS.length];
            return (
            <Link key={story.id} href={`/stories/${story.id}`} className="group">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <div
                  className={`h-24 bg-gradient-to-br ${
                    COLORS[index % COLORS.length]
                  } flex items-center justify-center`}
                >
                  <ImageFallback
                    src={coverSrc}
                    alt={story.title}
                    fallback={coverFallback}
                    size={96}
                    lazy
                  />
                </div>
                <div className="p-5">
                  <h2 className="text-lg font-bold text-gray-800 group-hover:text-purple-600 transition-colors">
                    {story.title}
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">
                    {t("story.linesCount", { n: String(story.sentences.length) })}
                  </p>
                  <div className="mt-3 text-purple-500 text-sm font-medium">
                    {t("story.readStory")}
                  </div>
                </div>
              </div>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
