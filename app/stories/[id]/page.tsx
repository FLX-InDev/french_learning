import { getAllStories, getStoryById } from "@/lib/parser";
import PlayButton from "@/components/PlayButton";
import Link from "next/link";
import { notFound } from "next/navigation";

interface StoryDetailPageProps {
  params: { id: string };
}

// Only allow pre-generated story paths
export const dynamicParams = false;

// Generate static paths for all stories
export function generateStaticParams() {
  const stories = getAllStories();
  return stories.map((story) => ({ id: story.id }));
}

export default function StoryDetailPage({ params }: StoryDetailPageProps) {
  const id = decodeURIComponent(params.id);
  const story = getStoryById(id);

  if (!story) {
    notFound();
  }

  return (
    <div className="space-y-8">
      {/* Back Link */}
      <Link
        href="/stories"
        className="inline-flex items-center gap-1 text-sm text-purple-500 hover:text-purple-700 transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        返回故事列表
      </Link>

      {/* Story Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800">{story.title}</h1>
        <p className="text-gray-400 mt-2">
          {story.sentences.length} 句话 · 中英法三语对照
        </p>
      </div>

      {/* Story Content */}
      <div className="space-y-4">
        {story.sentences.map((sentence, index) => (
          <div
            key={index}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow"
          >
            <div className="space-y-3">
              {/* Chinese */}
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-xs font-bold px-2 py-1 rounded-lg bg-red-50 text-red-500 mt-0.5">
                  中文
                </span>
                <p className="text-gray-800 text-lg leading-relaxed flex-1">
                  {sentence.zh}
                </p>
                <PlayButton text={sentence.zh} lang="zh" size="sm" />
              </div>

              {/* Divider */}
              <div className="border-t border-dashed border-gray-100" />

              {/* English */}
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-xs font-bold px-2 py-1 rounded-lg bg-blue-50 text-blue-500 mt-0.5">
                  EN
                </span>
                <p className="text-gray-600 leading-relaxed flex-1">
                  {sentence.en}
                </p>
                <PlayButton text={sentence.en} lang="en" size="sm" />
              </div>

              {/* French */}
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-xs font-bold px-2 py-1 rounded-lg bg-green-50 text-green-600 mt-0.5">
                  FR
                </span>
                <p className="text-gray-600 italic leading-relaxed flex-1">
                  {sentence.fr}
                </p>
                <PlayButton text={sentence.fr} lang="fr" size="sm" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Navigation */}
      <div className="text-center pt-4">
        <Link
          href="/stories"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full font-medium hover:shadow-lg transition-shadow"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          返回故事列表
        </Link>
      </div>
    </div>
  );
}
