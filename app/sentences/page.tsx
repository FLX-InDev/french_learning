import { getAllSentences } from "@/lib/parser";
import PlayButton from "@/components/PlayButton";

export default function SentencesPage() {
  const sentences = getAllSentences();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800">
          <span className="text-blue-500">📝</span> 常用句子
        </h1>
        <p className="text-gray-500 mt-2">
          共 {sentences.length} 个中英法三语对照句子
        </p>
      </div>

      {/* Sentence List */}
      <div className="space-y-3">
        {sentences.map((sentence, index) => (
          <div
            key={index}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-3">
              <span className="text-xs text-gray-300 font-mono mt-1 w-8 shrink-0 text-right">
                {index + 1}
              </span>
              <div className="flex-1 space-y-2">
                {/* Chinese */}
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-500">
                    中
                  </span>
                  <span className="text-gray-800">{sentence.zh}</span>
                  <PlayButton text={sentence.zh} lang="zh" size="sm" />
                </div>
                {/* English */}
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-500">
                    EN
                  </span>
                  <span className="text-gray-600">{sentence.en}</span>
                  <PlayButton text={sentence.en} lang="en" size="sm" />
                </div>
                {/* French */}
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-600">
                    FR
                  </span>
                  <span className="text-gray-600 italic">{sentence.fr}</span>
                  <PlayButton text={sentence.fr} lang="fr" size="sm" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
