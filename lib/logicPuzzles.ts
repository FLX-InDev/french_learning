/**
 * 逻辑扩展生成器（Phase 5C T5C.2）：数独（4/6 宫）、迷宫、演绎推理。
 * 全部纯函数 + 可注入 Rng 种子，保证确定性（同种子同盘面）。
 */
import { mulberry32, seedFromString, type Rng } from "./mathGenerator";

// ── 数独生成器（4 宫 2×2 / 6 宫 2×3）─────────────────────────────

export type SudokuCell = number | null; // 1..N or null（空格）
export type SudokuBoard = SudokuCell[][];

/** 创建空盘面 */
function emptyBoard(size: number): SudokuBoard {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

/** 在当前盘面中填入一个合法值（回溯），返回 true 表示成功 */
function solveSudoku(board: SudokuBoard, size: number, blockRows: number, blockCols: number): boolean {
  const [r, c] = findEmpty(board, size);
  if (r === -1) return true;
  const nums = shuffleArray(Array.from({ length: size }, (_, i) => i + 1), mulberry32(0));
  for (const n of nums) {
    if (isValid(board, r, c, n, size, blockRows, blockCols)) {
      board[r][c] = n;
      if (solveSudoku(board, size, blockRows, blockCols)) return true;
      board[r][c] = null;
    }
  }
  return false;
}

function findEmpty(board: SudokuBoard, size: number): [number, number] {
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (board[r][c] === null) return [r, c];
  return [-1, -1];
}

function isValid(board: SudokuBoard, r: number, c: number, n: number, size: number, br: number, bc: number): boolean {
  for (let i = 0; i < size; i++) { if (board[r][i] === n || board[i][c] === n) return false; }
  const boxR = Math.floor(r / br) * br, boxC = Math.floor(c / bc) * bc;
  for (let i = 0; i < br; i++) for (let j = 0; j < bc; j++) if (board[boxR + i][boxC + j] === n) return false;
  return true;
}

function shuffleArray<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** 数独唯一解数（简易回溯计数，上限 2） */
function countSolutions(board: SudokuBoard, size: number, br: number, bc: number, limit = 2): number {
  const [r, c] = findEmpty(board, size);
  if (r === -1) return 1;
  let count = 0;
  for (let n = 1; n <= size; n++) {
    if (isValid(board, r, c, n, size, br, bc)) {
      board[r][c] = n;
      count += countSolutions(board, size, br, bc, limit - count);
      board[r][c] = null;
      if (count >= limit) break;
    }
  }
  return count;
}

/** 生成数独题（4 宫 2×2 或 6 宫 2×3），返回 { puzzle, solution }，保证唯一解 */
export function generateSudoku(rng: Rng): { puzzle: SudokuBoard; solution: SudokuBoard; size: number; blockRows: number; blockCols: number } {
  const size = rng() < 0.5 ? 4 : 6;
  const br = 2, bc = size === 4 ? 2 : 3;
  const board = emptyBoard(size);
  solveSudoku(board, size, br, bc);
  const solution = board.map((r) => r.slice());
  // 移去部分格子（4 宫移 4 格，6 宫移 12 格）
  const remove = size === 4 ? 4 : 12;
  const cells = shuffleArray(Array.from({ length: size * size }, (_, i) => [Math.floor(i / size), i % size] as [number, number]), rng);
  for (let i = 0; i < remove; i++) {
    const [r, c] = cells[i];
    const backup = board[r][c];
    board[r][c] = null;
    const copy = board.map((r) => r.slice());
    if (countSolutions(copy, size, br, bc) !== 1) board[r][c] = backup;
  }
  return { puzzle: board, solution, size, blockRows: br, blockCols: bc };
}

// ── 迷宫生成器（DFS，5×5 到 10×10）────────────────────────────────

export type MazeCell = { top: boolean; right: boolean; bottom: boolean; left: boolean };
export type Maze = { rows: number; cols: number; grid: MazeCell[][] };

const DIRS: [number, number, keyof MazeCell, keyof MazeCell][] = [
  [-1, 0, "top", "bottom"], [0, 1, "right", "left"], [1, 0, "bottom", "top"], [0, -1, "left", "right"],
];

export function generateMaze(rng: Rng): Maze {
  const rows = 5 + Math.floor(rng() * 6);
  const cols = 5 + Math.floor(rng() * 6);
  const grid: MazeCell[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ top: true, right: true, bottom: true, left: true })));
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const stack: [number, number][] = [[0, 0]];
  visited[0][0] = true;
  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1];
    const neighbors = shuffleArray(DIRS.filter(([dr, dc]) => {
      const nr = r + dr, nc = c + dc;
      return nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc];
    }), rng);
    if (neighbors.length > 0) {
      const [dr, dc, wall, opposite] = neighbors[0];
      const nr = r + dr, nc = c + dc;
      grid[r][c][wall] = false;
      grid[nr][nc][opposite] = false;
      visited[nr][nc] = true;
      stack.push([nr, nc]);
    } else { stack.pop(); }
  }
  return { rows, cols, grid };
}

// ── 演绎推理生成器 ─────────────────────────────────────────────────

export type DeductionPuzzle = {
  suspects: { id: string; emoji: string; label: { zh: string; en: string; fr: string } }[];
  clues: { text: { zh: string; en: string; fr: string }; eliminates: string }[];
  answer: string;
};

const SUSPECTS = [
  { id: "fox", emoji: "🦊", label: { zh: "狐狸", en: "fox", fr: "renard" } },
  { id: "rabbit", emoji: "🐰", label: { zh: "兔子", en: "rabbit", fr: "lapin" } },
  { id: "cat", emoji: "🐱", label: { zh: "小猫", en: "cat", fr: "chat" } },
  { id: "dog", emoji: "🐶", label: { zh: "小狗", en: "dog", fr: "chien" } },
  { id: "bear", emoji: "🐻", label: { zh: "小熊", en: "bear", fr: "ours" } },
  { id: "monkey", emoji: "🐒", label: { zh: "猴子", en: "monkey", fr: "singe" } },
];

const CLUE_TEMPLATES = [
  (s: typeof SUSPECTS[number]) => ({ zh: `${s.label.zh}说不是我。`, en: `The ${s.label.en} says it wasn't them.`, fr: `Le ${s.label.fr} dit que ce n'est pas lui.` }),
  (s: typeof SUSPECTS[number]) => ({ zh: `不在${s.label.zh}那里。`, en: `Not with the ${s.label.en}.`, fr: `Pas chez le ${s.label.fr}.` }),
  (s: typeof SUSPECTS[number]) => ({ zh: `${s.label.zh}当时在睡觉。`, en: `The ${s.label.en} was sleeping.`, fr: `Le ${s.label.fr} dormait.` }),
  (s: typeof SUSPECTS[number]) => ({ zh: `${s.label.zh}在吃别的东西。`, en: `The ${s.label.en} was eating something else.`, fr: `Le ${s.label.fr} mangeait autre chose.` }),
];

export function generateDeduction(rng: Rng): DeductionPuzzle {
  const count = 3 + Math.floor(rng() * 2); // 3–4 suspects
  const pool = shuffleArray(SUSPECTS.slice(), rng).slice(0, count);
  const answerIdx = Math.floor(rng() * count);
  const answer = pool[answerIdx];
  const clues = pool.filter((_, i) => i !== answerIdx).map((s) => {
    const t = CLUE_TEMPLATES[Math.floor(rng() * CLUE_TEMPLATES.length)];
    return { text: t(s), eliminates: s.id };
  });
  return { suspects: pool.map((s) => ({ ...s })), clues, answer: answer.id };
}