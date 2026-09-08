"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { DialoguePlayer } from "@/components/dialogues/DialoguePlayer";
import { cancelSpeech, speak } from "@/lib/audioManager";
import type { Sentence, Story } from "@/lib/parser";
import type { Dialogue } from "@/lib/contentTypes";

/** 情绪卡 12 张（T5B.2，PRD §7.9.4）：纯点击 + 语音，L1 可用 */
const EMOTIONS = [
  { emoji: "😊", zh: "我很开心！", en: "I am happy!", fr: "Je suis content !" },
  { emoji: "😢", zh: "我有点难过。", en: "I feel a little sad.", fr: "Je suis un peu triste." },
  { emoji: "😠", zh: "我生气了！", en: "I am angry!", fr: "Je suis fâché !" },
  { emoji: "😨", zh: "我有点害怕。", en: "I feel a little scared.", fr: "J'ai un peu peur." },
  { emoji: "😲", zh: "哇，好惊讶！", en: "Wow, I'm surprised!", fr: "Oh, je suis surpris !" },
  { emoji: "😳", zh: "我有点害羞。", en: "I feel a bit shy.", fr: "Je suis un peu timide." },
  { emoji: "😴", zh: "我有点累了。", en: "I feel tired.", fr: "Je suis fatigué." },
  { emoji: "😋", zh: "我饿了。", en: "I'm hungry.", fr: "J'ai faim." },
  { emoji: "🥤", zh: "我渴了。", en: "I'm thirsty.", fr: "J'ai soif." },
  { emoji: "🥺", zh: "我想妈妈了。", en: "I miss Mom.", fr: "Maman me manque." },
  { emoji: "😴", zh: "我有点无聊。", en: "I'm a bit bored.", fr: "Je m'ennuie un peu." },
  { emoji: "😎", zh: "我做到了，真自豪！", en: "I did it, so proud!", fr: "J'ai réussi, je suis fier !" },
];

/** 10 个场景节点（对应 dialogues.md 的 scene 值与 sentences.md 的 scene 标注） */
const SCENES = [
  { emoji: "🌅", name: "入园问候", label: "Arrivée" },
  { emoji: "🎵", name: "晨圈", label: "Rassemblement" },
  { emoji: "✏️", name: "上课", label: "Classe" },
  { emoji: "🍎", name: "加餐", label: "Goûter" },
  { emoji: "🛝", name: "户外活动", label: "Récréation" },
  { emoji: "🍽️", name: "午餐", label: "Déjeuner" },
  { emoji: "😴", name: "午睡", label: "Sieste" },
  { emoji: "🧦", name: "起床整理", label: "Réveil" },
  { emoji: "🧸", name: "游戏时间", label: "Jeux" },
  { emoji: "👋", name: "离园再见", label: "Départ" },
];

export function LifeView({ sentences, dialogues }: { sentences: Sentence[]; dialogues: Dialogue[] }) {
  const { state } = useAppState();
  const [activeScene, setActiveScene] = useState<string | null>(null);
  const [activeEmotion, setActiveEmotion] = useState<number | null>(null);

  const sceneDialogues = useMemo(() => (activeScene ? dialogues.filter((d) => d.scene === activeScene) : []), [activeScene, dialogues]);
  const sceneSentences = useMemo(() => (activeScene ? sentences.filter((s) => s.scene === activeScene) : []), [activeScene, sentences]);

  return (
    <div className="space-y-8">
      {/* 场景路径（10 节点地图，T5B.3） */}
      <section>
        <h2 className="text-lg font-bold text-gray-800 mb-3">📅 场景路径</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {SCENES.map((s) => (
            <button key={s.name} onClick={() => setActiveScene((v) => (v === s.name ? null : s.name))} aria-pressed={activeScene === s.name}
              className={"rounded-2xl border-2 p-3 text-center transition min-h-[88px] " + (activeScene === s.name ? "border-purple-500 bg-purple-50" : "border-gray-100 bg-white hover:border-purple-200")}>
              <div className="text-3xl">{s.emoji}</div>
              <div className="text-sm font-bold text-gray-800 mt-1">{s.name}</div>
              <div className="text-[10px] text-gray-400">{s.label}</div>
            </button>
          ))}
        </div>
        {activeScene && (
          <div className="mt-4 space-y-4">
            {sceneDialogues.length > 0 && <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <h3 className="font-bold text-gray-800 mb-2">💬 对话</h3>
              {sceneDialogues.map((d) => <div key={d.id} className="mb-3"><h4 className="text-sm font-semibold text-purple-600 mb-1">{d.title.zh}</h4><DialoguePlayer dialogue={d} /></div>)}
            </div>}
            {sceneSentences.length > 0 && <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <h3 className="font-bold text-gray-800 mb-2">📝 相关句子</h3>
              <div className="space-y-1.5">{sceneSentences.slice(0, 6).map((s, i) => <div key={i} className="text-sm text-gray-600 italic">« {s.fr} »</div>)}</div>
            </div>}
            {sceneDialogues.length === 0 && sceneSentences.length === 0 && <div className="text-center text-gray-400 py-4">该场景暂无内容</div>}
          </div>
        )}
      </section>
      {/* 情绪卡（T5B.2） */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-lg font-bold text-gray-800 mb-3">😊 情绪表达卡</h2>
        <p className="text-xs text-gray-500 mb-3">点一下卡片，听听怎么说（L1 也可用，纯点击 + 语音）</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {EMOTIONS.map((e, i) => <button key={i} onClick={() => { cancelSpeech(); void speak(e.fr, "fr"); setActiveEmotion(i); }} aria-pressed={activeEmotion === i}
            className={"rounded-2xl border-2 p-3 text-center transition min-h-[80px] " + (activeEmotion === i ? "border-purple-500 bg-purple-50" : "border-gray-100 bg-white hover:border-purple-200")}>
            <div className="text-3xl">{e.emoji}</div><div className="text-[11px] text-gray-700 mt-1">{e.zh}</div>
          </button>)}
        </div>
      </section>
    </div>
  );
}