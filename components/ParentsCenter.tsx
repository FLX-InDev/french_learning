"use client";

import { useRef, useState } from "react";
import { useAppState } from "./AppStateProvider";
import { LevelPicker } from "./LevelPicker";
import { ParentGate } from "./ParentGate";
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
  const { state, update, replace } = useAppState();
  const [passed, setPassed] = useState(false);
  const [pendingLevel, setPendingLevel] = useState<Level | null>(null);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!state) {
    return <div className="py-20 text-center text-gray-400">加载中…</div>;
  }

  if (!passed) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="text-center py-10">
          <div className="text-5xl">🔒</div>
          <h1 className="text-2xl font-bold text-gray-800 mt-3">家长中心</h1>
          <p className="text-sm text-gray-500 mt-2">
            需要通过家长验证才能进入（学段、时长、内容开关与备份）
          </p>
        </div>
        <ParentGate
          title="家长中心"
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
    setMsg("学段已切换，学习记录不会丢失");
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
    setMsg("已导出 v2 备份");
  }

  function doImport(file: File) {
    const rd = new FileReader();
    rd.onload = () => {
      const next = importBackup(String(rd.result ?? ""));
      if (!next) {
        setMsg("文件格式不正确，未改动现有数据");
        return;
      }
      replace(next);
      setMsg("导入成功（v1 备份已自动升级为 v2）");
    };
    rd.readAsText(file);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800">🔒 家长中心</h1>
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
        <h2 className="text-xl font-bold text-gray-800 mb-1">🎓 学习阶段</h2>
        <p className="text-xs text-gray-500 mb-3">
          切换后内容难度立即调整，历史积分 / 星星 / 学习记录不会丢失。
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
          今日已用 {usedMin} 分钟
          {Number.isFinite(leftSec)
            ? ` · 剩余 ${Math.ceil(leftSec / 60)} 分钟`
            : " · 不限时"}
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
              {v === 0 ? "不限" : `${v} 分钟`}
            </button>
          ))}
        </div>
      </section>

      {/* 语音 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-3">🔊 语音与音效</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">朗读语速：</span>
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
              {r === 0.75 ? "慢速（0.75×）" : "正常（0.9×）"}
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
          音效反馈（答对/答错/亮星/通关；静音只关音效，朗读不受影响）
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
          点按音效（默认关；开启后字母卡/页签点击有轻响）
        </label>
      </section>

      {/* 内容开关 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-1">📚 内容开关</h2>
        <p className="text-xs text-gray-500 mb-3">
          关闭后该内容在全站隐藏（叠加在 manifest 勾选之上，不会删除学习记录）。
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
                    {item.filename} · {counts[item.type] ?? 0} 条
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      {/* 备份 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-1">💾 数据备份</h2>
        <p className="text-xs text-gray-500 mb-3">
          导出为 v2 格式；导入同时兼容 v1 与 v2 备份。
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={doExport}>
            导出 v2 备份
          </button>
          <button
            className="btn-secondary"
            onClick={() => fileRef.current?.click()}
          >
            导入恢复
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
              if (!confirm("确定清空全部学习数据？此操作不可撤销。")) return;
              replace(createInitialState(state.profile.level));
              setMsg("已清空，回到初始状态");
            }}
          >
            清空全部数据
          </button>
        </div>
      </section>

      {/* 学段切换确认弹窗 */}
      {pendingLevel && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-900/50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-800">
              确认切换学段？
            </h3>
            <p className="text-sm text-gray-500 mt-2">
              内容难度将调整，学习记录不会丢失。
            </p>
            <div className="flex gap-2 mt-5">
              <button
                className="btn-secondary flex-1"
                onClick={() => setPendingLevel(null)}
              >
                取消
              </button>
              <button
                className="btn-primary flex-1"
                onClick={() => applyLevel(pendingLevel)}
              >
                确认切换
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
