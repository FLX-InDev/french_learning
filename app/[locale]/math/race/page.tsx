import type { Metadata } from "next";
import { pageMeta } from "@/lib/metaDict";
import { RaceGame } from "@/components/math/race/RaceGame";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return pageMeta(params.locale, "meta.mathRace");
}

export default function MathRacePage() {
  return <RaceGame />;
}
