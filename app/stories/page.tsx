import { getAllStories } from "@/lib/parser";
import Link from "next/link";

const storyColors = [
  "from-pink-400 to-rose-400",
  "from-purple-400 to-indigo-400",
  "from-blue-400 to-cyan-400",
  "from-green-400 to-emerald-400",
  "from-yellow-400 to-amber-400",
  "from-orange-400 to-red-400",
  "from-teal-400 to-cyan-400",
  "from-indigo-400 to-purple-400",
  "from-rose-400 to-pink-400",
  "from-amber-400 to-yellow-400",
];

const storyEmojis = [
  "🐰",
  "🐻",
  "🐦",
  "🐶",
  "🐱",
  "🐷",
  "🐑",
  "🦆",
  "🐴",
  "🦊",
];

export default function StoriesPage() {
  const stories = getAllStories();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800">
          <span className="text-purple-500">📖</span> 小故事
        </h1>
        <p className="text-gray-500 mt-2">
          共 {stories.length} 个中英法三语对照故事
        </p>
      </div>

      {/* Story Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {stories.map((story, index) => (
          <Link key={story.id} href={`/stories/${story.id}`} className="group">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              {/* Gradient Header */}
              <div
                className={`h-24 bg-gradient-to-br ${
                  storyColors[index % storyColors.length]
                } flex items-center justify-center`}
              >
                <span className="text-4xl">
                  {storyEmojis[index % storyEmojis.length]}
                </span>
              </div>

              {/* Content */}
              <div className="p-5">
                <h2 className="text-lg font-bold text-gray-800 group-hover:text-purple-600 transition-colors">
                  {story.title}
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  {story.sentences.length} 句话 · 三语对照
                </p>
                <div className="mt-3 flex items-center text-purple-500 text-sm font-medium">
                  <span>阅读故事</span>
                  <svg
                    className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
