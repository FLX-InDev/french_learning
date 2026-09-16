"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "./AppStateProvider";
import { LevelPicker } from "./LevelPicker";
import { ParentGate } from "./ParentGate";
import { WeeklyReport } from "./growth/ProgressView";
import { BgmToggle } from "./BgmToggle";
import { CONTENT_META, type ContentType } from "@/lib/contentTypes";
import { levelLabel, type Level } from "@/lib/levels";
import {
  DAILY_LIMIT_OPTIONS,
  createInitialState,
  exportBackup,
  importBackup,
  remainingSec,
  type SpeechRate,
} from "@/lib/workspace";

export type ParentManifestItem = {
  type: ContentType;
  name: string;
  filename: string;
  description: string;
};

export function ParentsCenter({
  manifest,
  counts,
}: {
  manifest: ParentManifestItem[];
  counts: Partial<Record<ContentType, number>>;
}) {
  const { t } = useI18n();
  const { state, update, replace } = useAppState();
  const [passed, setPassed] = useState(false);
  const [pendingLevel, setPendingLevel] = useState<Level | null>(null);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!state) {
    return <div className="py-20 text-center text-gray-400">{t("workspace.loading")}</div>;
  }

  if (!passed) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="text-center py-10">
          <div className="text-5xl">🔒</div>
          <h1 className="text-2xl font-bold text-gray-800 mt-3">{t("home.parentsModal.title")}</h1>
          <p className="text-sm text-gray-500 mt-2">
            {t('parentsCenter.gateDesc')}
          </p>
        </div>
        <ParentGate
          title={t("home.parentsModal.title")}
          onPass={() => setPassed(true)}
          onCancel={() => (window.location.href = "/")}
        />
      </div>
    );
  }

  const usedMin = Math.round(state.screenTime.usedSec / 60);
  const leftSec = remainingSec(state.screenTime, state.settings.dailyLimitMin);

  function applyLevel(level: Level) {
    update((s) => ({ ...s, profile: { ...s.profile, level } }));
    setPendingLevel(null);
    setMsg(t("parentsCenter.levelSwitched"));
  }

  function toggleContent(type: ContentType) {
    update((s) => {
      const hidden = s.settings.hiddenContent.includes(type)
        ? s.settings.hiddenContent.filter((t) => t !== type)
        : [...s.settings.hiddenContent, type];
      return { ...s, settings: { ...s.settings, hiddenContent: hidden } };
    });
  }

  function doExport() {
    if (!state) return;
    const blob = new Blob([exportBackup(state)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "french-learning-backup-v2.json";
    a.click();
    setMsg(t("parentsCenter.exported"));
  }

  function doImport(file: File) {
    const rd = new FileReader();
    rd.onload = () => {
      const next = importBackup(String(rd.result ?? ""));
      if (!next) {
        setMsg(t("workspace.importBadFormat"));
        return;
      }
      replace(next);
      setMsg(t("parentsCenter.imported"));
    };
    rd.readAsText(file);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800">{t("home.parentsModal.title")}</h1>
        <p className="text-gray-500 mt-2 text-sm">
          当前学段：{levelLabel(state.profile.level)}
        </p>
      </div>

      {msg && (
        <div className="bg-purple-50 text-purple-700 text-sm rounded-xl px-4 py-2">
          {msg}
        </div>
      )}

      {/* 学段 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-1">{t('parentsCenter.level')}</h2>
        <p className="text-xs text-gray-500 mb-3">
          {t('parentsCenter.levelDesc')}
        </p>
        <LevelPicker
          value={state.profile.level}
          onChange={(l) => setPendingLevel(l)}
        />
      </section>

      {/* 时长 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-1">⏱ 每日时长</h2>
        <p className="text-xs text-gray-500 mb-3">
          {t('parentsCenter.todayUsed', { min: String(usedMin) })}
          {Number.isFinite(leftSec)
            ? ` · ${t('parentsCenter.remaining', { min: String(Math.ceil(leftSec / 60)) })}`
            : t('parentsCenter.unlimited')}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {DAILY_LIMIT_OPTIONS.map((v) => (
            <button
              key={v}
              onClick={() =>
                update((s) => ({
                  ...s,
                  settings: { ...s.settings, dailyLimitMin: v },
                }))
              }
              aria-pressed={state.settings.dailyLimitMin === v}
              className={
                "min-h-[48px] rounded-xl border-2 font-semibold transition " +
                (state.settings.dailyLimitMin === v
                  ? "border-purple-500 bg-purple-50 text-purple-700"
                  : "border-gray-100 bg-white text-gray-600 hover:border-purple-200")
              }
            >
              {v === 0 ? t('parentsCenter.unlimited') : t('parentsCenter.minutes', { v: String(v) })}
            </button>
          ))}
        </div>
      </section>

      {/* 语音 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-3">{t('parentsCenter.voiceAndSfx')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">{t('parentsCenter.speechRate')}：</span>
          {([0.75, 0.9] as SpeechRate[]).map((r) => (
            <button
              key={r}
              onClick={() =>
                update((s) => ({
                  ...s,
                  settings: { ...s.settings, speechRate: r },
                }))
              }
              aria-pressed={state.settings.speechRate === r}
              className={
                "min-h-[48px] px-4 rounded-xl border-2 font-semibold transition " +
                (state.settings.speechRate === r
                  ? "border-purple-500 bg-purple-50 text-purple-700"
                  : "border-gray-100 bg-white text-gray-600")
              }
            >
              {r === 0.75 ? t('parentsCenter.slow') : t('parentsCenter.normal')}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 mt-4 text-sm text-gray-600">
          <input
            type="checkbox"
            className="w-5 h-5"
            checked={state.settings.sfxOn}
            onChange={(e) =>
              update((s) => ({
                ...s,
                settings: { ...s.settings, sfxOn: e.target.checked },
              }))
            }
          />
          {t('parentsCenter.sfxFeedback')}
        </label>
        <label className="flex items-center gap-2 mt-2 text-sm text-gray-600">
          <input
            type="checkbox"
            className="w-5 h-5"
            checked={state.settings.tapSfxOn}
            onChange={(e) =>
              update((s) => ({
                ...s,
                settings: { ...s.settings, tapSfxOn: e.target.checked },
              }))
            }
          />
          {t('parentsCenter.tapSfx')}
        </label>

        {/* 背景音乐（Phase 6 T6-02）：独立于音效开关，默认关，音量低于 TTS */}
        <div className="mt-4">
          <BgmToggle />
        </div>
      </section>

      {/* 内容开关 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-1">{t('parentsCenter.contentSwitches')}</h2>
        <p className="text-xs text-gray-500 mb-3">
          {t('parentsCenter.contentHidden')}
        </p>
        <div className="space-y-2">
          {manifest.map((item) => {
            const hidden = state.settings.hiddenContent.includes(item.type);
            const meta = CONTENT_META[item.type];
            return (
              <label
                key={item.filename}
                className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl"
              >
                <input
                  type="checkbox"
                  className="w-5 h-5"
                  checked={!hidden}
                  onChange={() => toggleContent(item.type)}
                />
                <span className="text-xl">{meta.emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-sm text-gray-800">
                    {item.name}
                  </span>
                  <span className="block text-xs text-gray-400 truncate">
                    {item.filename} · {counts[item.type] ?? 0} {t('parentsCenter.items')}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      {/* 备份 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-1">{t('parentsCenter.dataBackup')}</h2>
        <p className="text-xs text-gray-500 mb-3">
          {t('parentsCenter.backupDesc')}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={doExport}>
            {t('parentsCenter.exportV2')}
          </button>
          <button
            className="btn-secondary"
            onClick={() => fileRef.current?.click()}
          >
            {t('parentsCenter.importRestore')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) doImport(f);
              e.target.value = "";
            }}
          />
          <button
            className="btn-secondary"
            onClick={() => {
              if (!confirm(t("workspace.confirmClear"))) return;
              replace(createInitialState(state.profile.level));
              setMsg("已清空，回到初始状态");
            }}
          >
            {t('parentsCenter.clearAll')}
          </button>
        </div>
      </section>

      {/* 入园倒计时（T5B.6 P2 占位） */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 opacity-60">
        <h2 className="text-xl font-bold text-gray-800 mb-1">{t('parentsCenter.kindergartenCountdown')}</h2>
        <p className="text-xs text-gray-500 mb-3">
          {t('parentsCenter.kindergartenDesc')}
        </p>
        <div className="text-sm text-gray-400 italic">{t('parentsCenter.comingSoon')}</div>
      </section>

      {/* 每周学习报告（T5D.4） */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-3">{t('parentsCenter.weeklyReport')}</h2>
        <WeeklyReport />
      </section>

      {/* 学段切换确认弹窗 */}
      {pendingLevel && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-900/50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-800">
              {t('parentsCenter.confirmSwitch')}
            </h3>
            <p className="text-sm text-gray-500 mt-2">
              {t('parentsCenter.switchDesc')}
            </p>
            <div className="flex gap-2 mt-5">
              <button
                className="btn-secondary flex-1"
                onClick={() => setPendingLevel(null)}
              >
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary flex-1"
                onClick={() => applyLevel(pendingLevel)}
              >
                {t('parentsCenter.confirmSwitchBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
