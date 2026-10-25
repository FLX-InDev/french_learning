import {
  DEFAULT_THRESHOLDS,
  type JudgeConfig,
  type JudgeReason,
  type JudgeThresholds,
} from "@/components/alphabets/strokeMatcher";

/**
 * 汉字描红的判定配置：阈值 + 提示文案 key。
 *
 * 阈值全部落在归一化 `[0,100]` 空间（1 单位 ≈ 3px @300px 画布），改任何数值都要
 * 同步契约 E 的常量行，并跑 `strokeJudge.test.ts` 的「手抖」合成笔迹回归。
 * 文案 key 由汉字层提供，`InkTrace` 只按 key 取词——字母通道没有判定，也不读这些 key。
 */

/** 数值以 `strokeMatcher.DEFAULT_THRESHOLDS` 为准（契约 E 记录同源） */
export const HANZI_JUDGE_PRESET: JudgeThresholds = { ...DEFAULT_THRESHOLDS };

/** 各失败原因对应的提示文案 key（`hanziJudge.` 模块字典，三语等量） */
export const JUDGE_REASON_KEYS: Record<JudgeReason, string> = {
  offStart: "hanziJudge.hintRetryStart",
  offPath: "hanziJudge.hintOffPath",
  incomplete: "hanziJudge.hintIncomplete",
};

export const HANZI_JUDGE: JudgeConfig = {
  thresholds: HANZI_JUDGE_PRESET,
  hints: JUDGE_REASON_KEYS,
  text: {
    idle: "hanziJudge.hintIdle",
    progress: "hanziJudge.progress",
    done: "hanziJudge.done",
    otherStroke: "hanziJudge.hintOtherStroke",
    oneByOne: "hanziJudge.hintOneByOne",
  },
  /** 同一笔连错 3 次 → 自动只回放这一笔 */
  failsForHint: 3,
};
