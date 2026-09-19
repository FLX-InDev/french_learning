import type { Metadata } from "next";
import { pageMeta } from "@/lib/metaDict";
import { MathMap } from "@/components/MathMap";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return pageMeta(params.locale, "meta.math");
}

export default function MathPage() {
  return <MathMap />;
}
