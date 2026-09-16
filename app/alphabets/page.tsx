import { AlphabetView } from "@/components/alphabets/AlphabetView";
import { PageHeader } from "@/components/PageHeader";
import { getAllAlphabets, getAllWords } from "@/lib/parser";

export default function AlphabetsPage() {
  // SSG：字母卡与词卡在构建期注入，客户端按学段过滤（软切换）
  const alphabets = getAllAlphabets();
  const words = getAllWords();

  return (
    <div className="space-y-6">
      <PageHeader titleKey="page.alphabets.title" descKey="page.alphabets.desc" />
      <AlphabetView alphabets={alphabets} words={words} />
    </div>
  );
}
