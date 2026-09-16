/**
 * 翻译模块注册表（Phase 6 并行契约，见 `docs/phase-6/CONTEXT.md §2.2`）
 *
 * 目的：避免各并行工作流同时改写 `translations/<locale>.json` 造成写冲突。
 * 约定：
 * - 基础界面 chrome 仍位于 `translations/<locale>.json`（S0 独占，冻结）；
 * - 每个功能模块自建 `translations/modules/<locale>/<name>.json`，key 必须以 `<name>.` 开头；
 * - 模块文件需在本表登记后方可被加载（本文件由**集成者**独占，禁止流任务直接改动）。
 *
 * Phase 6 各流按契约 §3.4.4 登记：
 *   bgm（S1）/ songAudio（S2）/ race（S3）/ reportExport（S4）/
 *   srs · phonics · trace（S5）/ l6（S6）
 *
 * 当前已登记：bgm(S1) / reportExport(S4) / srs(S5) / phonics(S5) / race(S3)。
 * 未登记的模块（songAudio / trace / l6）待对应流交付后由集成者追加。
 */

import type { Locale } from "./workspace";

import zhBgm from "@/translations/modules/zh/bgm.json";
import enBgm from "@/translations/modules/en/bgm.json";
import frBgm from "@/translations/modules/fr/bgm.json";

import zhReportExport from "@/translations/modules/zh/reportExport.json";
import enReportExport from "@/translations/modules/en/reportExport.json";
import frReportExport from "@/translations/modules/fr/reportExport.json";

import zhSrs from "@/translations/modules/zh/srs.json";
import enSrs from "@/translations/modules/en/srs.json";
import frSrs from "@/translations/modules/fr/srs.json";

import zhPhonics from "@/translations/modules/zh/phonics.json";
import enPhonics from "@/translations/modules/en/phonics.json";
import frPhonics from "@/translations/modules/fr/phonics.json";

import zhRace from "@/translations/modules/zh/race.json";
import enRace from "@/translations/modules/en/race.json";
import frRace from "@/translations/modules/fr/race.json";

export type Dict = Record<string, string>;
export type LocaleModuleMap = Record<string, Dict>;

/**
 * 模块登记表：模块名 → 各语言字典。
 * 登记示例（集成者操作）：
 *   import zhBgm from "@/translations/modules/zh/bgm.json";
 *   ...
 *   zh: { bgm: zhBgm as Dict },
 */
export const MODULE_REGISTRY: Record<Locale, LocaleModuleMap> = {
  zh: {
    bgm: zhBgm as Dict,
    reportExport: zhReportExport as Dict,
    srs: zhSrs as Dict,
    phonics: zhPhonics as Dict,
    race: zhRace as Dict,
  },
  en: {
    bgm: enBgm as Dict,
    reportExport: enReportExport as Dict,
    srs: enSrs as Dict,
    phonics: enPhonics as Dict,
    race: enRace as Dict,
  },
  fr: {
    bgm: frBgm as Dict,
    reportExport: frReportExport as Dict,
    srs: frSrs as Dict,
    phonics: frPhonics as Dict,
    race: frRace as Dict,
  },
};

/** 聚合某语言下全部已登记模块的字典（无模块时返回空对象） */
export function moduleDictionaries(locale: Locale): Dict {
  const mods = MODULE_REGISTRY[locale];
  if (!mods) return {};
  return Object.assign({}, ...Object.values(mods)) as Dict;
}
