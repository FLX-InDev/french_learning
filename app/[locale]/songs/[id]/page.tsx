import { getAllSongs, getSongById } from "@/lib/parser";
import { SongDetailView } from "@/components/SongDetailView";
import { notFound } from "next/navigation";

interface SongDetailPageProps {
  params: { id: string };
}

export const dynamicParams = false;

export function generateStaticParams() {
  const songs = getAllSongs();
  return songs.map((song) => ({ id: song.id }));
}

/**
 * 儿歌详情页（服务端组件）：负责静态路径与 fs 内容读取；
 * 三语文案渲染下沉到客户端组件 `SongDetailView`（Phase 6 T6-01）。
 */
export default function SongDetailPage({ params }: SongDetailPageProps) {
  const id = decodeURIComponent(params.id);
  const song = getSongById(id);

  if (!song) {
    notFound();
  }

  return <SongDetailView song={song} />;
}
