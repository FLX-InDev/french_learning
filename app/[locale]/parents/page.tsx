import type { Metadata } from "next";
import { pageMeta } from "@/lib/metaDict";
import { getContentStats, parseManifest } from "@/lib/parser";
import { ParentsCenter, type ParentManifestItem } from "@/components/ParentsCenter";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return pageMeta(params.locale, "meta.parents");
}

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
