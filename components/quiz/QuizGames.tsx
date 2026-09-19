"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { useI18n } from "@/lib/i18n";
import { otherLocales } from "@/components/TriTitle";
import { cancelSpeech, speak, playSfx } from "@/lib/audioManager";
import { mulberry32, seedFromString } from "@/lib/mathGenerator";
import type { Word } from "@/lib/contentTypes";

// ── 连线配对（MatchGame，T5C.1）：左列 emoji+fr / 右列 zh，点选连线 ──

export function MatchGame({ words: src }: { words: Word[] }) {
  const { t } = useI18n();
  const pool = useMemo(() => {
    const picked = src.slice(0, 6).map((w) => ({ ...w }));
    while (picked.length < 4) picked.push(src[0]);
    return picked.slice(0, 4);
  }, [src]);
  const [left, setLeft] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const right = useMemo(() => {
    const r = pool.map((w) => w.zh);
    // shuffle right side
    const rng = mulberry32(seedFromString("match"));
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
    return r;
  }, [pool]);

  function selectRight(i: number) {
    if (left === null || matched.has(i)) return;
    const correct = right[i] === pool[left].zh;
    if (correct) { setMatched((s) => new Set(Array.from(s).concat([i, left]))); playSfx("correct"); } else playSfx("encourage");
    setLeft(null);
  }

  return <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
    <div className="space-y-2">{pool.map((w, i) => <button key={i} onClick={() => { if (!matched.has(i)) { setLeft(i); cancelSpeech(); void speak(w.fr, "fr"); } }} aria-pressed={left === i} className={(matched.has(i) ? "bg-green-50 border-green-300" : left === i ? "bg-purple-50 border-purple-400" : "bg-white border-gray-100") + " w-full rounded-xl border-2 p-3 text-center transition min-h-[56px]"}><div className="text-2xl">{w.emoji}</div><div className="text-xs text-gray-600">{w.fr}</div></button>)}</div>
    <div className="space-y-2">{right.map((zh, i) => <button key={i} onClick={() => selectRight(i)} disabled={matched.has(i)} className={(matched.has(i) ? "bg-green-50 border-green-300" : "bg-white border-gray-100 hover:border-purple-300") + " w-full rounded-xl border-2 p-3 text-sm text-gray-800 transition min-h-[56px]"}>{zh}</button>)}</div>
    {matched.size === pool.length * 2 && <div className="col-span-2 text-center text-green-600 font-bold">{t("quiz.allMatched")}</div>}
  </div>;
}

// ── 翻牌记忆（MemoryGame，T5C.1）：emoji↔fr 配对 ──

export function MemoryGame({ words: src }: { words: Word[] }) {
  const { t } = useI18n();
  const cards = useMemo(() => {
    const picked = src.slice(0, 6).map((w) => [
      { id: w.id + "_e", display: w.emoji, type: "emoji" as const, word: w },
      { id: w.id + "_w", display: w.fr, type: "word" as const, word: w },
    ]).flat();
    const rng = mulberry32(seedFromString("memory"));
    for (let i = picked.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [picked[i], picked[j]] = [picked[j], picked[i]]; }
    return picked;
  }, [src]);
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [pick1, setPick1] = useState<number | null>(null);

  function flip(i: number) {
    if (flipped.has(cards[i].id) || matched.has(cards[i].word.id)) return;
    if (pick1 === null) { setPick1(i); setFlipped((s) => new Set(Array.from(s).concat([cards[i].id]))); }
    else {
      setFlipped((s) => new Set(Array.from(s).concat([cards[i].id])));
      const a = cards[pick1], b = cards[i];
      if (a.word.id === b.word.id && a.type !== b.type) {
        setMatched((s) => new Set(Array.from(s).concat([a.word.id])));
        playSfx("correct");
        setPick1(null);
      } else {
        playSfx("encourage");
        setTimeout(() => { setFlipped((s) => { const n = new Set(s); n.delete(a.id); n.delete(b.id); return n; }); setPick1(null); }, 800);
      }
    }
  }

  return <div className="grid grid-cols-4 gap-2 max-w-sm mx-auto">
    {cards.map((c, i) => <button key={c.id} onClick={() => flip(i)} className={"min-h-[72px] rounded-xl border-2 text-2xl transition " + (flipped.has(c.id) || matched.has(c.word.id) ? "bg-white border-purple-300" : "bg-purple-600 text-white border-purple-600")}>{flipped.has(c.id) || matched.has(c.word.id) ? c.display : "?"}</button>)}
    {matched.size === src.length && <div className="col-span-4 text-center text-green-600 font-bold">{t("quiz.allMatched")}</div>}
  </div>;
}

// ── 词块排序（OrderGame，T5C.1）：拖拽/点选排序为正确句子 ──

export function OrderGame({ sentence }: { sentence: { fr: string; zh: string; en?: string } }) {
  const { t, locale } = useI18n();
  const words = useMemo(() => sentence.fr.split(" "), [sentence.fr]);
  const [order, setOrder] = useState<number[]>(() => {
    const rng = mulberry32(seedFromString("order_" + sentence.fr));
    const arr = words.map((_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  });
  const [slot, setSlot] = useState<number | null>(null);
  const [correct, setCorrect] = useState<boolean | null>(null);

  function move(from: number) {
    if (slot === null) { setSlot(from); return; }
    const next = order.slice();
    const [item] = next.splice(from, 1);
    next.splice(slot, 0, item);
    setOrder(next); setSlot(null);
  }

  function check() {
    const ok = order.every((w, i) => w === i);
    setCorrect(ok);
    playSfx(ok ? "correct" : "encourage");
  }

  return <div className="space-y-3 max-w-md mx-auto">
    <div className="text-sm text-gray-500 text-center">{t("quiz.orderHint", { zh: sentence[locale] ?? sentence.zh })}</div>
    {(() => {
      const [o1, o2] = otherLocales(locale);
      const subs = [sentence[o1], sentence[o2]].filter(Boolean);
      return subs.length > 0 ? <div className="text-center text-[11px] text-gray-400">{subs.join(" · ")}</div> : null;
    })()}
    <div className="flex flex-wrap gap-2 justify-center">{order.map((wi, i) => <button key={i} onClick={() => move(i)} aria-pressed={slot === i} className={(slot === i ? "ring-2 ring-purple-400" : "") + " min-h-[44px] px-3 rounded-xl border-2 text-sm font-semibold " + (correct !== null ? (correct ? "border-green-300 bg-green-50" : "border-red-200 bg-red-50") : "border-purple-100 bg-white")}>{words[wi]}</button>)}</div>
    {correct === null && <button className="btn-primary w-full" onClick={check}>{t("logic.check")}</button>}
    {correct === false && <div className="text-center text-sm text-orange-500">{t("quiz.orderRetry")}</div>}
    {correct && <div className="text-center text-green-600 font-bold">{t("quiz.orderCorrect")}</div>}
  </div>;
}

// ── 竖式题（VerticalForm，T5C.3）：数位对齐拖拽 ──

export function VerticalForm({ a, b, op }: { a: number; b: number; op: "+" | "-" }) {
  const { t } = useI18n();
  const [result, setResult] = useState<string | null>(null);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [carry, setCarry] = useState(false);
  const [input, setInput] = useState("");

  function submit() {
    const expected = op === "+" ? a + b : a - b;
    const ok = parseInt(input) === expected;
    setCorrect(ok); setResult(String(expected));
    playSfx(ok ? "correct" : "encourage");
    if (ok && op === "+" && (a % 10) + (b % 10) >= 10) setCarry(true);
  }

  return <div className="space-y-3 max-w-[200px] mx-auto">
    <div className="text-right text-2xl font-bold tabular-nums text-gray-800">{a}</div>
    <div className="text-right text-2xl font-bold tabular-nums text-gray-800">{op} {b}</div>
    <div className="border-t-2 border-gray-300 pt-1">
      {carry && <div className="text-xs text-amber-600 text-right">{t("quiz.carry")}</div>}
      {result === null ? <div className="flex items-center gap-2 justify-end">
        <input className="w-20 text-2xl font-bold text-right border-2 border-purple-200 rounded-lg px-2 py-1" value={input} onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button className="btn-primary" onClick={submit}>{t("math.confirm")}</button>
      </div> : <div className="text-right text-2xl font-bold tabular-nums text-purple-600">{result}</div>}
    </div>
    {correct !== null && <div className={"text-center text-sm font-bold " + (correct ? "text-green-600" : "text-orange-500")}>{correct ? t("quiz.correct") : t("quiz.tryAgain")}</div>}
  </div>;
}