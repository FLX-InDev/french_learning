import { getContentStats, getEnabledContentTypes, getAllStories, getAllSentences, getAllWords, getAllAlphabets } from "@/lib/parser";
import { buildPool } from "@/lib/workspace";
import { HomeView } from "@/components/HomeView";

export default function HomePage() {
  // 统计数字全部来自解析结果（修复 BUG-2：不再硬编码 300+/10/3）
  const stats = getContentStats();
  const enabled = getEnabledContentTypes();
  // 每日挑战题源：语言池（服务端构建）与拼词池素材（词卡+字母代表词）在构建期注入
  const pool = buildPool(getAllStories(), getAllSentences());
  const words = getAllWords();
  const alphabets = getAllAlphabets();

  return (
    <HomeView
      stats={stats}
      enabled={enabled}
      pool={pool}
      words={words}
      alphabets={alphabets}
    />
  );
}
