"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { cancelSpeech, configureSpeech, pause, speak, speechGeneration, playSfx, type VoiceRole } from "@/lib/audioManager";
import { usePronunciationCheck } from "@/components/usePronunciationCheck";
import { useI18n } from "@/lib/i18n";
import type { Dialogue } from "@/lib/contentTypes";

export function DialoguePlayer({ dialogue }: { dialogue: Dialogue }) {
  // 别名 i18nT：渲染循环里的 `t` 是「对话轮次」变量
  const { t: i18nT } = useI18n();
  const { state } = useAppState();
  const speechRate = state?.settings.speechRate ?? 0.9;
  const level = state?.profile.level ?? "L3";
  const [active, setActive] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rolePlay, setRolePlay] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const pr = usePronunciationCheck();
  useEffect(() => { configureSpeech(speechRate); }, [speechRate]);
  const stop = useCallback(() => { cancelSpeech(); setPlaying(false); setActive(null); setWaiting(false); }, []);
  const playAll = useCallback(async () => {
    cancelSpeech(); const gen = speechGeneration(); setPlaying(true);
    for (let i = 0; i < dialogue.turns.length; i++) {
      if (speechGeneration() !== gen) break;
      const t = dialogue.turns[i]; const role: VoiceRole = t.role === "B" ? "B" : "A";
      if (rolePlay && t.role === "B") { setActive(i); setWaiting(true); await pause(5000); if (speechGeneration() !== gen) break; setWaiting(false); }
      setActive(i); await speak(t.fr, "fr", role);
      if (speechGeneration() !== gen) break; await pause(600);
    }
    if (speechGeneration() === gen) { setPlaying(false); setActive(null); setWaiting(false); }
  }, [dialogue, rolePlay]);
  const playLine = useCallback((i: number) => { const t = dialogue.turns[i]; cancelSpeech(); void speak(t.fr, "fr", t.role === "B" ? "B" : "A"); }, [dialogue]);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button className={playing ? "bg-red-50 text-red-500 min-h-[40px] px-4 rounded-full text-sm font-semibold" : "bg-purple-600 text-white min-h-[40px] px-4 rounded-full text-sm font-semibold"} onClick={playing ? stop : playAll}>{playing ? i18nT("dialogue.stop") : i18nT("dialogue.playAll")}</button>
      <button onClick={() => { setRolePlay(v => !v); if (playing) stop(); }} aria-pressed={rolePlay} className={"min-h-[40px] px-4 rounded-full text-sm font-semibold " + (rolePlay ? "bg-pink-500 text-white" : "bg-pink-50 text-pink-500")}>{i18nT("dialogue.yourTurn")}{rolePlay ? i18nT("dialogue.rolePlayOn") : ""}</button>
    </div>
    {dialogue.turns.map((t, i) => { const isActive = active === i; const isBWait = waiting && isActive && t.role === "B";
      return <div key={i} onClick={() => { if (playing) stop(); else { playLine(i); if (rolePlay && t.role === "B") { setActive(i); setWaiting(true); pr.start(t.fr, "fr", level, (r, passed) => { playSfx(passed ? "correct":"encourage"); setWaiting(false); }); } } }} className={"rounded-xl border p-3 cursor-pointer transition " + (isActive ? (isBWait ? "border-pink-400 bg-pink-50" : "border-purple-400 bg-purple-50") : "border-gray-100 bg-white hover:bg-purple-50/50 " + (t.role === "B" ? "ml-8" : "mr-2"))}>
        <div className="flex items-start gap-2"><span className={"shrink-0 text-xs font-bold px-1.5 py-0.5 rounded " + (t.role === "A" ? "bg-blue-50 text-blue-600" : "bg-pink-50 text-pink-600")}>{t.role === "A" ? i18nT("dialogue.teacher") : i18nT("dialogue.child")}</span>
          <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="shrink-0 text-[10px] font-bold px-1 py-0.5 rounded bg-green-50 text-green-600">FR</span><span className="text-gray-600 italic">{t.fr}</span></div>
            <div className="flex items-center gap-2 text-xs mt-1"><span className="shrink-0 text-[10px] font-bold px-1 py-0.5 rounded bg-red-50 text-red-500">{i18nT("dialogue.langZhTag")}</span><span className="text-gray-700">{t.zh}</span></div></div></div>
        {isBWait && pr.state === "recording" && <div className="text-xs text-pink-500 mt-1 animate-pulse">{i18nT("dialogue.yourTurnRead")}</div>}
        {isBWait && pr.state === "done" && pr.result && <div className="text-xs mt-1"><span className={pr.result.score >= 70 ? "text-green-600" : "text-amber-500"}>{i18nT("dialogue.score", { score: String(pr.result.score) })}</span></div>}
      </div>;
    })}</div>;
}