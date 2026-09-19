import { getAllSentences, getAllDialogues } from "@/lib/parser";
import { LifeView } from "@/components/life/LifeView";
import { PageHeader } from "@/components/PageHeader";

export default function LifePage() {
  const sentences = getAllSentences();
  const dialogues = getAllDialogues();

  return (
    <div className="space-y-6">
      <PageHeader titleKey="page.life.title" descKey="page.life.desc" />
      <LifeView sentences={sentences} dialogues={dialogues} />
    </div>
  );
}
