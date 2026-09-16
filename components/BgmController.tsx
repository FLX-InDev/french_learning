"use client";

/**
 * 全局 BGM 控制器（Phase 6 T6-02，由集成者挂载于 app/layout.tsx）
 *
 * 无 UI，常驻根布局，唯一职责是把 `settings.bgmOn / settings.bgmVolume` 同步到
 * `lib/audioManager` 的 BGM 通道，并处理浏览器自动播放策略降级——这样刷新或停留
 * 在任意页面时 BGM 状态都能恢复，不依赖 `<BgmToggle />`（仅家长中心可见）是否挂载。
 *
 * 与 `<BgmToggle />` 的分工：BgmToggle 只负责 UI 与写 settings；
 * 音频通道同步统一收敛在本组件，避免两处重复调用 configureBgm。
 */

import { useEffect } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { BGM_DEFAULT_VOLUME, configureBgm, playBgm } from "@/lib/audioManager";

export function BgmController() {
  const { state, ready } = useAppState();
  const bgmOn = state?.settings.bgmOn === true;
  const bgmVolume = state?.settings.bgmVolume ?? BGM_DEFAULT_VOLUME;

  // 开关 / 音量 → audioManager（含首次挂载恢复；ready 前不触碰音频）
  useEffect(() => {
    if (!ready) return;
    configureBgm(bgmOn, bgmVolume);
  }, [ready, bgmOn, bgmVolume]);

  // 自动播放策略降级：开启状态下，若挂载时 play() 被拦截，
  // 在首次用户交互时重试（playBgm 幂等，已在播放则无副作用）
  useEffect(() => {
    if (!bgmOn || typeof window === "undefined") return;
    const retry = () => {
      playBgm();
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
    };
    window.addEventListener("pointerdown", retry);
    window.addEventListener("keydown", retry);
    return () => {
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
    };
  }, [bgmOn]);

  return null;
}
