import { getAllStories } from "@/lib/parser";
import { StoryList } from "@/components/StoryList";

export default function StoriesPage() {
  const stories = getAllStories();

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800">
          <span className="text-purple-500">📖</span> 小故事
        </h1>
        <p className="text-gray-500 mt-2">
          共 {stories.length} 个中英法三语对照故事
        </p>
      </div>

      <StoryList stories={stories} />
    </div>
  );
}
