import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/metaDict";
import { getAllMathItems } from "@/lib/parser";
import { allStageIds, findStage } from "@/lib/mathCurriculum";
import { MathQuiz } from "@/components/MathQuiz";

interface StagePageProps {
  params: { group: string; locale: string };
}

// 仅放行课程表里的关卡（与故事/儿歌详情页同口径）
export const dynamicParams = false;

// 关卡页按 stage id 预生成（内容在客户端按当前学段渲染）
export function generateStaticParams() {
  return allStageIds().map((id) => ({ group: id }));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return pageMeta(params.locale, "meta.mathStage");
}

export default function MathStagePage({ params }: StagePageProps) {
  const stageId = decodeURIComponent(params.group);
  // 已下线或非法的关卡 id 走 404，不进数学答题壳（否则会停在无题的空页面）
  if (!findStage(stageId)) {
    notFound();
  }

  // 固定题（math-bank.md）以 props 注入，与生成器题同管线渲染
  const fixedItems = getAllMathItems();

  return <MathQuiz stageId={stageId} fixedItems={fixedItems} />;
}
