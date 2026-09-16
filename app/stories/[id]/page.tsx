import { getAllStories, getStoryById } from "@/lib/parser";
import { StoryDetailView } from "@/components/StoryDetailView";
import { notFound } from "next/navigation";

interface StoryDetailPageProps {
  params: { id: string };
}

// Only allow pre-generated story paths
export const dynamicParams = false;

// Generate static paths for all stories
export function generateStaticParams() {
  const stories = getAllStories();
  return stories.map((story) => ({ id: story.id }));
}

/**
 * 故事详情页（服务端组件）：负责静态路径与 fs 内容读取；
 * 三语文案渲染下沉到客户端组件 `StoryDetailView`（Phase 6 T6-01）。
 */
export default function StoryDetailPage({ params }: StoryDetailPageProps) {
  const id = decodeURIComponent(params.id);
  const story = getStoryById(id);

  if (!story) {
    notFound();
  }

  return <StoryDetailView story={story} />;
}
