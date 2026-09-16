import type { Metadata } from "next";
import { RaceGame } from "@/components/math/race/RaceGame";

export const metadata: Metadata = {
  title: "口算限时赛 - 法语宝宝学",
  description: "60/90/120 秒口算限时连做，连对 combo 加分，本机排行榜",
};

export default function MathRacePage() {
  return <RaceGame />;
}
