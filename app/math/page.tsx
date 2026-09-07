import type { Metadata } from "next";
import { MathMap } from "@/components/MathMap";

export const metadata: Metadata = {
  title: "数学闯关 - 法语宝宝学",
  description: "按中国教学体系排期的数学关卡地图（含法国对标标签）",
};

export default function MathPage() {
  return <MathMap />;
}
