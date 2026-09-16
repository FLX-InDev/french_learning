"use client";

/**
 * BGM 开关（Phase 6 T6-02，契约 D：无 props，自读 settings.bgmOn / bgmVolume）
 *
 * - 开关与音量真源 = AppState.settings（刷新后状态保持，由 AppStateProvider 持久化）；
 * - 挂载点由集成者打补丁（家长中心/设置），本组件只交付自身；
 * - BGM 默认关（workspace.ts 默认值 bgmOn: false），遵守浏览器自动播放策略：
 *   挂载时被拦截的播放保持「想要播放」状态，首次用户交互（pointerdown/keydown）重试；
 * - 三语文案走 bgm.* 模块（translations/modules/<locale>/bgm.json，
 *   需集成者在 lib/i18nModules.ts 登记：bgm → 三语 bgm.json）。
 */

import { useAppState } from "@/components/AppStateProvider";
import { useI18n } from "@/lib/i18n";
import { BGM_DEFAULT_VOLUME } from "@/lib/audioManager";

/**
 * 分工说明：音频通道同步（configureBgm + 自动播放策略重试）已收敛到全局
 * `<BgmController />`（挂载于 `app/layout.tsx`），本组件只负责 UI 与写 settings，
 * 避免两处重复调用 configureBgm。
 */
export function BgmToggle() {
  const { t } = useI18n();
  const { state, update } = useAppState();

  const bgmOn = state?.settings.bgmOn === true;
  const bgmVolume = state?.settings.bgmVolume ?? BGM_DEFAULT_VOLUME;

  const toggle = () => {
    update((s) => ({
      ...s,
      settings: { ...s.settings, bgmOn: !s.settings.bgmOn },
    }));
  };

  const changeVolume = (v: number) => {
    update((s) => ({
      ...s,
      settings: { ...s.settings, bgmVolume: v },
    }));
  };

  return (
    <div className="rounded-2xl border border-purple-100 bg-white/80 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-700">{t("bgm.title")}</p>
          <p className="mt-0.5 text-xs text-gray-400">{t("bgm.desc")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={bgmOn}
          aria-label={t("bgm.title")}
          onClick={toggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
            bgmOn ? "bg-purple-500" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
              bgmOn ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
      <div className="mt-1 flex items-center justify-end gap-1 text-xs font-medium text-gray-500">
        <span aria-hidden>{bgmOn ? "🎵" : "🔇"}</span>
        <span>{t(bgmOn ? "bgm.toggle.on" : "bgm.toggle.off")}</span>
      </div>
      {bgmOn && (
        <div className="mt-3">
          <label
            htmlFor="bgm-volume"
            className="text-xs text-gray-500"
          >
            {t("bgm.volumeLabel", {
              n: String(Math.round(bgmVolume * 100)),
            })}
          </label>
          <input
            id="bgm-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={bgmVolume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            className="mt-1 w-full accent-purple-500"
          />
        </div>
      )}
    </div>
  );
}
