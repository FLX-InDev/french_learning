import { getAllStories } from "@/lib/parser";
import { StoryList } from "@/components/StoryList";
import { PageHeader } from "@/components/PageHeader";

export default function StoriesPage() {
  const stories = getAllStories();

  return (
    <div className="space-y-8">
      <PageHeader
        titleKey="nav.stories"
        descKey="page.story.lineCount"
        descVars={{ n: String(stories.length) }}
        big
      />
      <StoryList stories={stories} />
    </div>
  );
}
