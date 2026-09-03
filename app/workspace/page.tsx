import type { Metadata } from "next";
import { getAllStories, getAllSentences } from "@/lib/parser";
import WorkspaceView from "./WorkspaceView";

export const metadata: Metadata = {
  title: "学习工作台 - 法语宝宝学",
  description: "今日学习成果、测验点评、每日打卡与奖励积分",
};

export default function WorkspacePage() {
  const stories = getAllStories();
  const sentences = getAllSentences();
  return <WorkspaceView stories={stories} sentences={sentences} />;
}
