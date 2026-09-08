import { getAllSentences, getAllDialogues } from "@/lib/parser";
import { LifeView } from "@/components/life/LifeView";

export default function LifePage() {
  const sentences = getAllSentences();
  const dialogues = getAllDialogues();
  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-gray-800">🏫 我的幼儿园一天</h1>
        <p className="text-sm text-gray-400 mt-1">10 个场景 · 跟 Félix 提前演练入园生活</p>
      </header>
      <LifeView sentences={sentences} dialogues={dialogues} />
    </div>
  );
}