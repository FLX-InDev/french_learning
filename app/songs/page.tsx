import { SongList } from "@/components/songs/SongList";
import { getAllSongs } from "@/lib/parser";

export default function SongsPage() {
  // SSG：儿歌在构建期注入，客户端按学段过滤（软切换）
  const songs = getAllSongs();

  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-gray-800">🎵 儿歌卡拉OK</h1>
        <p className="text-sm text-gray-400 mt-1">
          逐句三语跟读跟唱，唱完一首都算任务完成
        </p>
      </header>
      <SongList songs={songs} />
    </div>
  );
}
