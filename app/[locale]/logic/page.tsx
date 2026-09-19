import type { Metadata } from "next";
import { pageMeta } from "@/lib/metaDict";
import { getAllLogicItems } from "@/lib/parser";
import { LogicCenter } from "@/components/logic/LogicBoard";
import { LogicExtensions } from "@/components/logic/LogicExtensions";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return pageMeta(params.locale, "meta.logic");
}

export default function LogicPage() {
  const fixedItems = getAllLogicItems();
  return (
    <div className="space-y-8">
      <LogicCenter fixedItems={fixedItems} />
      <LogicExtensions />
    </div>
  );
}