import { WordGallery } from "@/components/words/WordGallery";
import { getAllWords } from "@/lib/parser";

export default function WordsPage() {
  // SSG：全部词卡在构建期注入，客户端按学段（软切换）与分类过滤
  const words = getAllWords();

  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-gray-800">🃏 词汇图鉴</h1>
        <p className="text-sm text-gray-400 mt-1">
          按分类翻卡学词 · 点🎧磨耳朵 · 🎤跟读拿满分
        </p>
      </header>
      <WordGallery words={words} />
    </div>
  );
}
