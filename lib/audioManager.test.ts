import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { computeSfxVolume, SFX_FILES } from "./audioManager";

/**
 * 音效触发矩阵的资产与 duck 规则校验（PRD §7.3，Phase 4 T4.2）。
 * 时长上限由生成脚本 scripts/gen-sfx.cjs 的配方保证，此处校验文件存在与体积上限。
 */
describe("SFX 资产（触发矩阵）", () => {
  const names = ["correct", "encourage", "star", "levelup", "tap"] as const;

  it("SFX_FILES 覆盖 5 种音效且路径固定", () => {
    expect(Object.keys(SFX_FILES).sort()).toEqual([...names].sort());
    expect(SFX_FILES.correct).toBe("/audio/sfx/correct.wav");
  });

  it.each(names)("%s.wav 存在且体积 ≤ 80KB", (name) => {
    const file = join(process.cwd(), "public", SFX_FILES[name].replace(/^\//, ""));
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeLessThan(80 * 1024);
  });

  it("Lottie 资产合计 ≤ 500KB（PRD §7.3 体积预算）", () => {
    const dir = join(process.cwd(), "public", "lottie");
    const files = ["felix-idle.json", "felix-happy.json", "felix-encourage.json", "confetti.json"];
    let total = 0;
    for (const f of files) {
      const p = join(dir, f);
      expect(existsSync(p)).toBe(true);
      total += statSync(p).size;
    }
    expect(total).toBeLessThan(500 * 1024);
  });
});

describe("computeSfxVolume（duck 规则）", () => {
  it("TTS 播放中音效压低至 0.25，否则 0.9", () => {
    expect(computeSfxVolume(true)).toBe(0.25);
    expect(computeSfxVolume(false)).toBe(0.9);
  });
});
