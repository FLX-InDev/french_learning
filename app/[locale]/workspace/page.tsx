import type { Metadata } from "next";
import { pageMeta } from "@/lib/metaDict";
import { getAllStories, getAllSentences } from "@/lib/parser";
import WorkspaceView from "./WorkspaceView";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return pageMeta(params.locale, "meta.workspace");
}

export default function WorkspacePage() {
  const stories = getAllStories();
  const sentences = getAllSentences();
  return <WorkspaceView stories={stories} sentences={sentences} />;
}
