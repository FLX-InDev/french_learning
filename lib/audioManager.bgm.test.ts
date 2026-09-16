import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  BGM_DEFAULT_VOLUME,
  BGM_DUCK_VOLUME,
  BGM_FILE,
  computeBgmVolume,
} from "./audioManager";

/**
 * BGM 通道单测（Phase 6 T6-02）：
 * - duck 规则纯函数 computeBgmVolume（验收维度④：给出目标音量常量并单测）；
 * - 契约 E 常量冻结校验（CONTEXT.md §2.5）；
 * - 资产体积上限（验收维度⑥：循环片段 ≤200KB）。
 *
 * 不覆盖既有 audioManager.test.ts（SFX 触发矩阵），BGM 用例独立成文件。
 */
describe("BGM 契约常量（CONTEXT §2.5 契约 E）", () => {
  it("BGM_FILE 路径冻结为 /audio/bgm/loop.mp3", () => {
    expect(BGM_FILE).toBe("/audio/bgm/loop.mp3");
  });

  it("默认音量 0.2，duck 目标 0.08", () => {
    expect(BGM_DEFAULT_VOLUME).toBe(0.2);
    expect(BGM_DUCK_VOLUME).toBe(0.08);
  });
});

describe("computeBgmVolume（BGM duck 规则）", () => {
  it("关闭时音量恒为 0（BGM 默认关）", () => {
    expect(computeBgmVolume(false, 0.2, false)).toBe(0);
    expect(computeBgmVolume(false, 1, false)).toBe(0);
    expect(computeBgmVolume(false, 1, true)).toBe(0);
  });

  it("开启且无 TTS → 用户音量", () => {
    expect(computeBgmVolume(true, 0.2, false)).toBe(0.2);
    expect(computeBgmVolume(true, 0.5, false)).toBe(0.5);
  });

  it("TTS 播放中 → 压低至 duck 目标（验收维度④）", () => {
    expect(computeBgmVolume(true, 0.5, true)).toBe(BGM_DUCK_VOLUME);
    expect(computeBgmVolume(true, 1, true)).toBe(BGM_DUCK_VOLUME);
  });

  it("用户音量低于 duck 目标时不被抬高", () => {
    expect(computeBgmVolume(true, 0.05, true)).toBe(0.05);
  });

  it("音量越界 clamp 到 [0,1]", () => {
    expect(computeBgmVolume(true, 1.5, false)).toBe(1);
    expect(computeBgmVolume(true, -0.5, false)).toBe(0);
    expect(computeBgmVolume(true, 2, true)).toBe(BGM_DUCK_VOLUME);
  });
});

describe("BGM 资产", () => {
  it("loop.mp3 存在且 ≤200KB（验收维度⑥）", () => {
    const file = join(process.cwd(), "public", BGM_FILE.replace(/^\//, ""));
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeLessThanOrEqual(200 * 1024);
  });
});
