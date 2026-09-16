"use client";

import { useState, useCallback } from "react";
import { useAppState } from "./AppStateProvider";
import { LevelPicker } from "./LevelPicker";
import { DAILY_LIMIT_OPTIONS, DEFAULT_DAILY_LIMIT_MIN } from "@/lib/workspace";
import type { Level } from "@/lib/levels";
import { useI18n } from "@/lib/i18n";

/**
 * 首次启动引导（PRD §7.12.1 F45）
 * 选学段 → 设每日时长 → 发放狐狸蛋（mascot.stage = "egg"）
 */
export function Onboarding() {
  const { state, update } = useAppState();
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<Level>("L3");
  const [limit, setLimit] = useState<number>(DEFAULT_DAILY_LIMIT_MIN);

  if (!state || state.profile.onboarded) return null;

  function finish(nextLevel: Level, nextLimit: number) {
    update((s) => ({
      ...s,
      profile: { ...s.profile, level: nextLevel, onboarded: true },
      settings: { ...s.settings, dailyLimitMin: nextLimit },
      mascot: { stage: "egg", fedCount: 0 },
    }));
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-gray-900/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-h-[92vh] overflow-y-auto">
        <div className="text-center mb-5">
          <div className="text-4xl">🦊</div>
          <h2 className="text-xl font-bold text-gray-800 mt-2">
            {t('onboarding.welcome')}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {t('onboarding.intro')}
          </p>
        </div>

        {step === 0 && (
          <div>
            <h3 className="font-semibold text-gray-700 mb-3">
              {t('onboarding.step1')}
            </h3>
            <LevelPicker value={level} onChange={setLevel} />
            <button
              className="btn-primary w-full mt-5"
              onClick={() => setStep(1)}
            >
              {t('onboarding.next')}
            </button>
          </div>
        )}

        {step === 1 && (
          <div>
            <h3 className="font-semibold text-gray-700 mb-3">
              {t('onboarding.step2')}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {DAILY_LIMIT_OPTIONS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setLimit(v)}
                  aria-pressed={limit === v}
                  className={
                    "min-h-[48px] rounded-xl border-2 font-semibold transition " +
                    (limit === v
                      ? "border-purple-500 bg-purple-50 text-purple-700"
                      : "border-gray-100 bg-white text-gray-600 hover:border-purple-200")
                  }
                >
                  {v === 0 ? t('onboarding.unlimited') : t('onboarding.minutes', { v: String(v) })}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                className="btn-secondary flex-1"
                onClick={() => setStep(0)}
              >
                {t('onboarding.prev')}
              </button>
              <button className="btn-primary flex-1" onClick={() => setStep(2)}>
                {t('onboarding.next')}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="text-center">
            <div className="text-5xl">🥚</div>
            <h3 className="font-bold text-gray-800 mt-3">
              {t('onboarding.foxEgg')}
            </h3>
            <p className="text-sm text-gray-500 mt-2">
              {t('onboarding.foxEggDesc')}
            </p>
            <button
              className="btn-primary w-full mt-5"
              onClick={() => finish(level, limit)}
            >
              {t('onboarding.start')}
            </button>
          </div>
        )}

        <button
          className="w-full text-center text-xs text-gray-400 mt-4 py-2"
          onClick={() => finish(level, limit)}
        >
          {t('onboarding.skip')}
        </button>
      </div>
    </div>
  );
}
