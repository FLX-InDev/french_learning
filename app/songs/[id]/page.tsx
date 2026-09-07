import { KaraokePlayer } from "@/components/songs/KaraokePlayer";
import { getAllSongs, getSongById } from "@/lib/parser";
import Link from "next/link";
import { notFound } from "next/navigation";

interface SongDetailPageProps {
  params: { id: string };
}

export const dynamicParams = false;

export function generateStaticParams() {
  const songs = getAllSongs();
  return songs.map((song) => ({ id: song.id }));
}

export default function SongDetailPage({ params }: SongDetailPageProps) {
  const id = decodeURIComponent(params.id);
  const song = getSongById(id);

  if (!song) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <KaraokePlayer song={song} />
      {/* 无障碍/降级提示：音频播放依赖浏览器能力 */}
      <noscript>
        <p className="text-center text-sm text-gray-400">
          需要启用 JavaScript 才能播放儿歌朗读。
        </p>
      </noscript>
      <p className="text-center text-xs text-gray-300">
        <Link href="/songs">儿歌库</Link> · 播放页由 TTS 逐句朗读（音色依设备可用语音而定）
      </p>
    </div>
  );
}
