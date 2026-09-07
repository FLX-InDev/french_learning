import { getAllSentences } from "@/lib/parser";
import { SentenceList } from "@/components/SentenceList";

export default function SentencesPage() {
  const sentences = getAllSentences();

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800">
          <span className="text-blue-500">📝</span> 常用句子
        </h1>
        <p className="text-gray-500 mt-2">
          共 {sentences.length} 个中英法三语对照句子
        </p>
      </div>

      <SentenceList sentences={sentences} />
    </div>
  );
}
