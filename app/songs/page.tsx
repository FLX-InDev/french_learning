import { SongList } from "@/components/songs/SongList";
import { PageHeader } from "@/components/PageHeader";
import { getAllSongs } from "@/lib/parser";

export default function SongsPage() {
  // SSG：儿歌在构建期注入，客户端按学段过滤（软切换）
  const songs = getAllSongs();

  return (
    <div className="space-y-6">
      <PageHeader titleKey="page.songs.title" descKey="page.songs.desc" />
      <SongList songs={songs} />
    </div>
  );
}
