import type { Metadata } from "next";
import { getAllMathItems } from "@/lib/parser";
import { allStageIds } from "@/lib/mathCurriculum";
import { MathQuiz } from "@/components/MathQuiz";

interface StagePageProps {
  params: { group: string };
}

// 关卡页按 stage id 预生成（内容在客户端按当前学段渲染）
export function generateStaticParams() {
  return allStageIds().map((id) => ({ group: id }));
}

export const metadata: Metadata = {
  title: "数学关卡 - 法语宝宝学",
};

export default function MathStagePage({ params }: StagePageProps) {
  const stageId = decodeURIComponent(params.group);
  // 固定题（math-bank.md）以 props 注入，与生成器题同管线渲染
  const fixedItems = getAllMathItems();

  return <MathQuiz stageId={stageId} fixedItems={fixedItems} />;
}
