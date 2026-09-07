import { AlphabetView } from "@/components/alphabets/AlphabetView";
import { getAllAlphabets, getAllWords } from "@/lib/parser";

export default function AlphabetsPage() {
  // SSG：字母卡与词卡在构建期注入，客户端按学段过滤（软切换）
  const alphabets = getAllAlphabets();
  const words = getAllWords();

  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-gray-800">🔤 字母与拼写</h1>
        <p className="text-sm text-gray-400 mt-1">
          点字母卡翻面听发音；到下面的拼词游戏里试一试身手
        </p>
      </header>
      <AlphabetView alphabets={alphabets} words={words} />
    </div>
  );
}
