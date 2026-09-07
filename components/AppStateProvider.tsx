"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addUsedTime,
  loadState,
  saveState,
  type AppState,
} from "@/lib/workspace";
import { configureSfx } from "@/lib/audioManager";

type AppStateCtx = {
  state: AppState | null;
  ready: boolean;
  /** 以不可变方式更新状态树（自动持久化） */
  update: (fn: (s: AppState) => AppState) => void;
  replace: (next: AppState) => void;
};

const EMPTY: AppStateCtx = {
  state: null,
  ready: false,
  update: () => {},
  replace: () => {},
};

const AppStateContext = createContext<AppStateCtx | null>(null);

/**
 * 全站状态中枢（PRD §9.4）
 * - localStorage 单键 `wb_frws_state` 持久化，读取时走 v1→v2 迁移；
 * - 页面可见时累计真实使用时长（visibilitychange 计时，F46 基础）；
 * - 所有页面/组件通过 useAppState() 读写 `profile.level`（学段唯一真源）。
 */
export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);

  // 首屏读取（避免 SSR 与客户端不一致：状态只在客户端装载）
  useEffect(() => {
    setState(loadState());
  }, []);

  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

  const update = useCallback((fn: (s: AppState) => AppState) => {
    setState((s) => (s ? fn(s) : s));
  }, []);

  const replace = useCallback((next: AppState) => {
    setState(next);
  }, []);

  // 音效开关 → audioManager（静音只关音效不关 TTS；tap 默认关，Phase 4 触发矩阵）
  useEffect(() => {
    if (state) configureSfx(state.settings.sfxOn, state.settings.tapSfxOn);
  }, [state?.settings.sfxOn, state?.settings.tapSfxOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 使用时长累计：每 5 秒记账一次，页面不可见不计 ──
  useEffect(() => {
    if (!state) return;
    if (typeof document === "undefined") return;

    let last = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const sec = (now - last) / 1000;
      last = now;
      if (document.hidden) return;
      // 忽略休眠/后台标签造成的时间跳变
      if (sec <= 0 || sec > 120) return;
      setState((s) =>
        s ? { ...s, screenTime: addUsedTime(s.screenTime, sec) } : s
      );
    }, 5000);

    const onVisibility = () => {
      last = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [state !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<AppStateCtx>(
    () => ({ state, ready: !!state, update, replace }),
    [state, update, replace]
  );

  return (
    <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
  );
}

/** 读取全局状态；无 Provider 时退化为「未就绪」，组件自行降级 */
export function useAppState(): AppStateCtx {
  return useContext(AppStateContext) ?? EMPTY;
}

/** 供测试与家长中心使用：直接替换整棵状态树 */
export function useReplaceState() {
  const { replace } = useAppState();
  return replace;
}
