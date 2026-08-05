import { parseManifest } from "@/lib/parser";
import Link from "next/link";

const typeIcons: Record<string, string> = {
  sentences: "📝",
  stories: "📖",
  songs: "🎵",
  dialogues: "💬",
};

const typeColors: Record<string, string> = {
  sentences: "from-blue-400 to-cyan-400",
  stories: "from-purple-400 to-pink-400",
  songs: "from-yellow-400 to-orange-400",
  dialogues: "from-green-400 to-teal-400",
};

export default function HomePage() {
  const materials = parseManifest();
  const enabledMaterials = materials.filter((m) => m.enabled);

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center py-12">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          <span className="bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 bg-clip-text text-transparent">
            法语宝宝学
          </span>
        </h1>
        <p className="text-lg text-gray-500 mb-2">
          Bébé apprend le français
        </p>
        <p className="text-gray-400 max-w-md mx-auto">
          中英法三语对照，帮助孩子从小接触法语，在故事和日常句子中快乐学习
        </p>
        <div className="flex justify-center gap-3 mt-6">
          <span className="px-3 py-1 rounded-full bg-red-50 text-red-500 text-sm font-medium">
            🇨🇳 中文
          </span>
          <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-500 text-sm font-medium">
            🇬🇧 English
          </span>
          <span className="px-3 py-1 rounded-full bg-green-50 text-green-600 text-sm font-medium">
            🇫🇷 Français
          </span>
        </div>
      </section>

      {/* Material Cards */}
      <section>
        <h2 className="text-2xl font-bold text-gray-700 mb-6 flex items-center gap-2">
          <span className="text-purple-500">✨</span> 学习内容
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {enabledMaterials.map((material) => (
            <Link
              key={material.type}
              href={`/${material.type}`}
              className="group block"
            >
              <div className="relative overflow-hidden bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-gray-100">
                {/* Gradient Banner */}
                <div
                  className={`h-32 bg-gradient-to-br ${
                    typeColors[material.type] || "from-gray-400 to-gray-500"
                  } flex items-center justify-center`}
                >
                  <span className="text-5xl">
                    {typeIcons[material.type] || "📚"}
                  </span>
                </div>

                {/* Card Content */}
                <div className="p-5">
                  <h3 className="text-xl font-bold text-gray-800 group-hover:text-purple-600 transition-colors">
                    {material.name}
                  </h3>
                  <p className="text-gray-500 text-sm mt-1">
                    {material.description}
                  </p>
                  <div className="mt-3 flex items-center text-purple-500 text-sm font-medium">
                    <span>开始学习</span>
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
      </section>

      {/* Stats */}
      <section className="bg-white/60 backdrop-blur-sm rounded-2xl p-8 border border-purple-100">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-3xl font-bold text-purple-600">300+</div>
            <div className="text-sm text-gray-500 mt-1">常用句子</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-pink-500">10</div>
            <div className="text-sm text-gray-500 mt-1">趣味故事</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-blue-500">3</div>
            <div className="text-sm text-gray-500 mt-1">语言对照</div>
          </div>
        </div>
      </section>
    </div>
  );
}
