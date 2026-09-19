"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { useI18n } from "@/lib/i18n";
import { playSfx } from "@/lib/audioManager";
import { mulberry32, seedFromString } from "@/lib/mathGenerator";
import {
  generateSudoku, generateMaze, generateDeduction,
  type SudokuBoard,
} from "@/lib/logicPuzzles";

/** 数独 4/6 宫 */
function SudokuBoard() {
  const { state } = useAppState();
  const { t } = useI18n();
  const level = state?.profile.level ?? "L3";
  const size = level === "L3" || level === "L4" ? 4 : 6;
  const [data, setData] = useState(() => generateSudoku(mulberry32(seedFromString("sudoku_" + size))));
  const [board, setBoard] = useState<SudokuBoard>(data.puzzle.map((r) => r.slice()));
  const [checked, setChecked] = useState(false);
  const [msg, setMsg] = useState("");
  function setCell(r: number, c: number, v: number) {
    if (data.puzzle[r][c] !== null || checked) return;
    const next = board.map((row) => row.slice());
    next[r][c] = next[r][c] === v ? null : v;
    setBoard(next);
  }
  function check() {
    const ok = board.every((row, r) => row.every((v, c) => v === data.solution[r][c]));
    setChecked(true); setMsg(ok ? t("logic.ext.sudokuDone") : t("logic.ext.sudokuRetry"));
    playSfx(ok ? "correct" : "encourage");
  }
  return <div className="space-y-3 max-w-[320px] mx-auto">
    <div className="text-sm text-gray-500 text-center">
      {t("logic.ext.sudokuHint", { size: String(size), range: size === 4 ? "1–4" : "1–6" })}
    </div>
    <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
      {board.map((row, r) => row.map((v, c) => {
        const given = data.puzzle[r][c] !== null;
        return <button key={`${r}${c}`} onClick={() => { const next = (v ?? 0) + 1; setCell(r, c, next > size ? 1 : next); }}
          className={"min-h-[48px] text-xl font-bold border " + (given ? "bg-gray-100 text-gray-800" : checked ? (v === data.solution[r][c] ? "bg-green-50 text-green-700" : "bg-red-50 text-red-500") : "bg-white hover:bg-purple-50")}>
          {v ?? ""}</button>;
      }))}
    </div>
    <div className="flex gap-2 justify-center">
      <button className="btn-primary" onClick={check} disabled={checked}>{t("logic.check")}</button>
      <button className="btn-secondary" onClick={() => { const d = generateSudoku(mulberry32(seedFromString("sudoku_" + size + "_" + Date.now()))); setData(d); setBoard(d.puzzle.map((r) => r.slice())); setChecked(false); setMsg(""); }}>{t("logic.ext.newPuzzle")}</button>
    </div>
    {msg && <div className="text-center text-sm font-semibold text-green-600">{msg}</div>}
  </div>;
}

/** 迷宫 */
function MazeGame() {
  const { t } = useI18n();
  const [maze, setMaze] = useState(() => generateMaze(mulberry32(42)));
  const [pos, setPos] = useState<[number, number]>([0, 0]);
  const [won, setWon] = useState(false);
  function move(dr: number, dc: number) {
    if (won) return; const [r, c] = pos; const cell = maze.grid[r][c];
    if (dr === -1 && cell.top) return; if (dr === 1 && cell.bottom) return;
    if (dc === -1 && cell.left) return; if (dc === 1 && cell.right) return;
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= maze.rows || nc < 0 || nc >= maze.cols) return;
    setPos([nr, nc]); if (nr === maze.rows - 1 && nc === maze.cols - 1) { setWon(true); playSfx("levelup"); }
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "ArrowUp") move(-1, 0); if (e.key === "ArrowDown") move(1, 0); if (e.key === "ArrowLeft") move(0, -1); if (e.key === "ArrowRight") move(0, 1); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, maze]);
  return <div className="space-y-3 max-w-sm mx-auto">
    <div className="text-sm text-gray-500 text-center">{t("logic.ext.mazeHint")}</div>
    <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${maze.cols}, 1fr)` }}>
      {Array.from({ length: maze.rows }, (_, r) => Array.from({ length: maze.cols }, (_, c) => {
        const isHere = r === pos[0] && c === pos[1]; const cell = maze.grid[r][c];
        const b = [cell.top && "bt", cell.right && "br", cell.bottom && "bb", cell.left && "bl"].filter(Boolean).join(" ");
        return <div key={`${r}${c}`} className={"min-h-[36px] flex items-center justify-center text-lg border-gray-300 " + (cell.top ? "border-t-2 " : "") + (cell.right ? "border-r-2 " : "") + (cell.bottom ? "border-b-2 " : "") + (cell.left ? "border-l-2 " : "")}>
          {isHere ? "🦊" : r === 0 && c === 0 ? "🚪" : r === maze.rows - 1 && c === maze.cols - 1 ? "⭐" : ""}</div>;
      }))}
    </div>
    {won && <div className="text-center text-green-600 font-bold">{t("logic.ext.mazeDone")}</div>}
    <div className="flex gap-2 justify-center">
      {[["↑", -1, 0], ["←", 0, -1], ["→", 0, 1], ["↓", 1, 0]].map(([label, dr, dc]) => <button key={label} className="min-h-[48px] w-12 rounded-xl bg-purple-50 text-purple-600 text-xl font-bold" onClick={() => move(Number(dr), Number(dc))}>{label}</button>)}
      <button className="btn-secondary" onClick={() => { setMaze(generateMaze(mulberry32(Date.now()))); setPos([0, 0]); setWon(false); }}>{t("logic.ext.newMaze")}</button>
    </div>
  </div>;
}

/** 演绎推理 */
function DeductionGame() {
  const { t, locale } = useI18n();
  const [data, setData] = useState(() => generateDeduction(mulberry32(99)));
  const [eliminated, setEliminated] = useState<Set<string>>(new Set());
  const [guess, setGuess] = useState<string | null>(null);
  const [result, setResult] = useState<boolean | null>(null);
  function check() { const ok = guess === data.answer; setResult(ok); playSfx(ok ? "correct" : "encourage"); }
  return <div className="space-y-3 max-w-sm mx-auto">
    <div className="text-sm text-gray-500 text-center">{t("logic.ext.deductionHint")}</div>
    {data.clues.map((c, i) => <button key={i} onClick={() => setEliminated((s) => new Set(Array.from(s).concat([c.eliminates])))} className={"w-full rounded-xl border-2 p-3 text-left text-sm transition " + (eliminated.has(c.eliminates) ? "bg-green-50 border-green-200" : "bg-white border-gray-100 hover:border-purple-300")}><div className="font-bold text-purple-600">{c.text[locale]}</div><div className="text-xs text-gray-400">{c.text.fr}</div></button>)}
    <div className="flex gap-2 justify-center">{data.suspects.map((s) => <button key={s.id} onClick={() => { if (!eliminated.has(s.id)) setGuess(s.id); }} disabled={!!result || eliminated.has(s.id)} aria-pressed={guess === s.id} className={(eliminated.has(s.id) ? "opacity-30" : guess === s.id ? "ring-2 ring-purple-400" : "") + " rounded-xl border-2 p-2 text-center min-w-[64px] " + (result ? (s.id === data.answer ? "border-green-400 bg-green-50" : "border-red-200 bg-red-50") : "border-gray-100 bg-white")}><div className="text-2xl">{s.emoji}</div><div className="text-[10px]">{s.label[locale]}</div></button>)}</div>
    {!result && <button className="btn-primary w-full" onClick={check} disabled={!guess}>{t("logic.ext.accuse")}</button>}
    {result !== null && <div className={"text-center font-bold " + (result ? "text-green-600" : "text-orange-500")}>{result ? t("logic.ext.correct") : t("logic.ext.thinkAgain")} {!result && <button className="btn-secondary mt-2" onClick={() => { setData(generateDeduction(mulberry32(Date.now()))); setEliminated(new Set()); setGuess(null); setResult(null); }}>{t("logic.ext.newPuzzle")}</button>}</div>}
  </div>;
}

/** 逻辑扩展区包装（Phase 5C T5C.2） */
const TABS = ["sudoku", "maze", "deduction"] as const;
type Tab = typeof TABS[number];
const TAB_KEYS: Record<Tab, string> = {
  sudoku: "logic.ext.tabSudoku",
  maze: "logic.ext.tabMaze",
  deduction: "logic.ext.tabDeduction",
};
export function LogicExtensions() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("sudoku");
  return <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
    <h2 className="text-lg font-bold text-gray-800 mb-3">{t("logic.ext.moreChallenges")}</h2>
    <div className="flex gap-2 mb-4">
      {TABS.map((k) => <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} className={"text-xs px-3 py-1.5 rounded-full font-semibold transition min-h-[36px] " + (tab === k ? "bg-purple-600 text-white" : "bg-purple-50 text-purple-600")}>{t(TAB_KEYS[k])}</button>)}
    </div>
    {tab === "sudoku" && <SudokuBoard />}
    {tab === "maze" && <MazeGame />}
    {tab === "deduction" && <DeductionGame />}
  </section>;
}
