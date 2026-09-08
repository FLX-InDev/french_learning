"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { DialoguePlayer } from "@/components/dialogues/DialoguePlayer";
import { matchesLevel, type Dialogue } from "@/lib/contentTypes";

export function ClientDialogues({ dialogues }: { dialogues: Dialogue[] }) {
  const { state } = useAppState();
  const level = state?.profile.level ?? "L3";
  const hidden = state?.settings.hiddenContent ?? [];
  const [expanded, setExpanded] = useState<string | null>(null);
  const list = useMemo(() => dialogues.filter((d) => matchesLevel(d.level, level)), [dialogues, level]);
  if (hidden.includes("dialogue")) return <div className="text-center text-gray-400 py-10">该内容已被家长关闭。</div>;
  return <div className="space-y-3">{(list).map((d) => <div key={d.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
    <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(e => e === d.id ? null : d.id)}>
      <div><div className="font-bold text-gray-800">{d.title.zh}</div><div className="text-xs text-purple-500">{d.scene} · {d.level ?? "通用"}</div></div>
      <span className="text-sm">{expanded === d.id ? "▲" : "▼"}</span>
    </div>
    {expanded === d.id && <div className="mt-3 pt-3 border-t border-dashed border-gray-100"><DialoguePlayer dialogue={d} /></div>}
  </div>)}</div>;
}