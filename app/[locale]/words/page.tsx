import { WordGallery } from "@/components/words/WordGallery";
import { PageHeader } from "@/components/PageHeader";
import { getAllWords } from "@/lib/parser";

export default function WordsPage() {
  // SSG：全部词卡在构建期注入，客户端按学段（软切换）与分类过滤
  const words = getAllWords();

  return (
    <div className="space-y-6">
      <PageHeader titleKey="page.words.title" descKey="page.words.desc" />
      <WordGallery words={words} />
    </div>
  );
}
