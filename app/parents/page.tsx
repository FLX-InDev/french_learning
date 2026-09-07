import type { Metadata } from "next";
import { getContentStats, parseManifest } from "@/lib/parser";
import { ParentsCenter, type ParentManifestItem } from "@/components/ParentsCenter";

export const metadata: Metadata = {
  title: "家长中心 - 法语宝宝学",
  description: "学段、每日时长、内容开关与数据备份（家长门保护）",
};

export default function ParentsPage() {
  const manifest: ParentManifestItem[] = parseManifest()
    .filter((e) => e.enabled)
    .map((e) => ({
      type: e.type,
      name: e.name,
      filename: e.filename,
      description: e.description,
    }));
  const counts = getContentStats();

  return <ParentsCenter manifest={manifest} counts={counts} />;
}
