import type { Metadata } from "next";
import { getAllLogicItems } from "@/lib/parser";
import { LogicCenter } from "@/components/logic/LogicBoard";
import { LogicExtensions } from "@/components/logic/LogicExtensions";

export const metadata: Metadata = {
  title: "逻辑推理 - 法语宝宝学",
  description: "中法融合的六大逻辑能力域（找规律 / 分类排序 / 找不同等）",
};

export default function LogicPage() {
  const fixedItems = getAllLogicItems();
  return (
    <div className="space-y-8">
      <LogicCenter fixedItems={fixedItems} />
      <LogicExtensions />
    </div>
  );
}