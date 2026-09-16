import { getAllSentences } from "@/lib/parser";
import { SentenceList } from "@/components/SentenceList";
import { PageHeader } from "@/components/PageHeader";

export default function SentencesPage() {
  const sentences = getAllSentences();

  return (
    <div className="space-y-8">
      <PageHeader
        titleKey="page.sentences.title"
        descKey="page.sentences.count"
        descVars={{ n: String(sentences.length) }}
        big
      />
      <SentenceList sentences={sentences} />
    </div>
  );
}
