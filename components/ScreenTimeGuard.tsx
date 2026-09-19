"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n, localizedHref } from "@/lib/i18n";
import { useAppState } from "./AppStateProvider";
import { ParentGate } from "./ParentGate";
import { isTimeUp } from "@/lib/workspace";
import { setScreenTimePaused } from "@/lib/screenTimePause";

/** 连续使用多久弹出休息提示 */
const BREAK_EVERY_SEC = 15 * 60;
/** 休息遮罩时长 */
const BREAK_SEC = 30;
/** 家长门解锁一次延长的时长 */
const EXTEND_SEC = 10 * 60;

function msLeftToday(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}

function hhmmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/**
 * 时长控制与护眼（PRD §7.12.4 F46）
 * - 每日时长用尽 → 护眼页遮罩所有学习入口，仅家长门可解锁；
 * - 连续使用 15 分钟 → 30 秒休息遮罩。
 */
export function ScreenTimeGuard() {
  const { t, locale } = useI18n();
  const { state, update } = useAppState();
  const [gateOpen, setGateOpen] = useState(false);
  const [breakLeft, setBreakLeft] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastBreakRef = useRef(0);

  const used = state?.screenTime.usedSec ?? 0;
  const limit = state?.settings.dailyLimitMin ?? 0;
  const timeUp = !!state && isTimeUp(state.screenTime, limit);

  // 倒计时期间读最新 used（用 ref，避免把 used 放进倒计时 effect 的依赖里反复重启定时器）
  const usedRef = useRef(used);
  useEffect(() => {
    usedRef.current = used;
  }, [used]);

  // 连续使用 15 分钟 → 休息遮罩
  useEffect(() => {
    if (!state || timeUp) return;
    if (breakLeft !== null) return; // 已在休息中：不再重复触发
    if (used - lastBreakRef.current >= BREAK_EVERY_SEC) {
      // 先落基线：否则倒计时期间 used 持续增长会反复满足条件、把倒计时重置回 30s
      lastBreakRef.current = used;
      setBreakLeft(BREAK_SEC);
    }
  }, [used, timeUp, state, breakLeft]);

  // 休息倒计时（只依赖 breakLeft，保证每秒稳定递减）
  useEffect(() => {
    if (breakLeft === null) return;
    if (breakLeft <= 0) {
      lastBreakRef.current = usedRef.current;
      setBreakLeft(null);
      return;
    }
    const id = window.setTimeout(() => setBreakLeft((v) => (v ?? 1) - 1), 1000);
    return () => window.clearTimeout(id);
  }, [breakLeft]);

  // 休息遮罩期间：暂停当日时长累计（休息时间不算学习时长）
  useEffect(() => {
    setScreenTimePaused(breakLeft !== null);
    return () => setScreenTimePaused(false);
  }, [breakLeft]);

  // 护眼页的「明日恢复」倒计时
  useEffect(() => {
    if (!timeUp) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timeUp]);

  if (!state) return null;

  if (timeUp && !gateOpen) {
    return (
      <div className="fixed inset-0 z-[300] bg-gradient-to-b from-indigo-100 to-purple-100 flex items-center justify-center p-6">
        <div className="bg-white/90 backdrop-blur rounded-3xl p-8 max-w-md w-full text-center shadow-xl">
          <div className="text-5xl">🦊</div>
          <h2 className="text-xl font-bold text-gray-800 mt-3">
            {t('screenTime.breakTitle')}
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            {t('screenTime.limitReached', { min: String(state.settings.dailyLimitMin) })}
          </p>
          <div className="text-3xl font-extrabold text-purple-600 mt-4 tabular-nums">
            {hhmmss(msLeftToday())}
          </div>
          <p className="text-xs text-gray-400 mt-1">{t('screenTime.restoreAfter')}</p>
          <div className="flex flex-col gap-2 mt-6">
            <button className="btn-primary" onClick={() => setGateOpen(true)}>
              {t('screenTime.parentUnlock')}
            </button>
            <a className="btn-secondary" href={localizedHref(locale, "/parents")}>
              {t('screenTime.goParents')}
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (breakLeft !== null && !timeUp) {
    return (
      <div className="fixed inset-0 z-[290] bg-gray-900/70 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-xl">
          <div className="text-5xl">👀</div>
          <h2 className="text-xl font-bold text-gray-800 mt-3">
            {t('screenTime.restTip')}
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            {t('screenTime.continuous15min')}
          </p>
          <div className="text-4xl font-extrabold text-purple-600 mt-4 tabular-nums">
            {breakLeft}s
          </div>
        </div>
      </div>
    );
  }

  if (gateOpen) {
    return (
      <ParentGate
        title={t('screenTime.parentUnlock')}
        hint={t('screenTime.extendHint')}
        onCancel={() => setGateOpen(false)}
        onPass={() => {
          update((s) => ({
            ...s,
            screenTime: {
              ...s.screenTime,
              usedSec: Math.max(0, s.screenTime.usedSec - EXTEND_SEC),
            },
          }));
          lastBreakRef.current = Math.max(
            0,
            state.screenTime.usedSec - EXTEND_SEC
          );
          setGateOpen(false);
        }}
      />
    );
  }

  return null;
}
