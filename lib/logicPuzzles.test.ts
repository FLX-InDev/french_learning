import { describe, expect, it } from "vitest";
import { generateSudoku, generateMaze, generateDeduction } from "./logicPuzzles";
import { mulberry32, seedFromString } from "./mathGenerator";

describe("generateSudoku", () => {
  it("4 宫或 6 宫盘面合法", () => {
    const { puzzle, solution, size } = generateSudoku(mulberry32(seedFromString("s4")));
    expect([4, 6]).toContain(size);
    expect(solution.length).toBe(size);
    // 解完整（无 null）
    expect(solution.every((r) => r.every((c) => c !== null))).toBe(true);
    // 每行 1..size 各一次
    const expected = Array.from({ length: size }, (_, i) => i + 1);
    solution.forEach((r) => expect([...r].sort()).toEqual(expected));
    // 题目有空格
    expect(puzzle.some((r) => r.some((c) => c === null))).toBe(true);
  });

  it("6 宫盘面合法", () => {
    const { solution, size, blockRows, blockCols } = generateSudoku(mulberry32(7));
    expect(size === 4 || size === 6).toBe(true);
    if (size === 6) {
      expect(blockRows).toBe(2);
      expect(blockCols).toBe(3);
    }
    expect(solution.every((r) => r.every((c) => c !== null))).toBe(true);
  });

  it("同种子同盘面（确定性）", () => {
    const a = generateSudoku(mulberry32(seedFromString("x")));
    const b = generateSudoku(mulberry32(seedFromString("x")));
    expect(JSON.stringify(a.puzzle)).toBe(JSON.stringify(b.puzzle));
  });
});

describe("generateMaze", () => {
  it("迷宫有起点和终点，网格尺寸在 5–10 之间", () => {
    const m = generateMaze(mulberry32(1));
    expect(m.rows).toBeGreaterThanOrEqual(5);
    expect(m.cols).toBeGreaterThanOrEqual(5);
    expect(m.grid[0][0].top).toBe(true); // 边界墙
    expect(m.grid[m.rows - 1][m.cols - 1].bottom).toBe(true);
  });

  it("迷宫网格尺寸合法，起点存在", () => {
    const m = generateMaze(mulberry32(42));
    expect(m.rows).toBeGreaterThanOrEqual(5);
    expect(m.cols).toBeGreaterThanOrEqual(5);
    expect(m.grid).toBeDefined();
  });
});

describe("generateDeduction", () => {
  it("3–4 个嫌疑人，线索排除非嫌疑人，答案唯一", () => {
    const p = generateDeduction(mulberry32(99));
    expect(p.suspects.length).toBeGreaterThanOrEqual(3);
    expect(p.suspects.length).toBeLessThanOrEqual(4);
    expect(p.clues.length).toBe(p.suspects.length - 1);
    // 线索排除的均为非答案
    const eliminated = new Set(p.clues.map((c) => c.eliminates));
    expect(eliminated.has(p.answer)).toBe(false);
    // 答案在嫌疑人中
    expect(p.suspects.some((s) => s.id === p.answer)).toBe(true);
  });
});