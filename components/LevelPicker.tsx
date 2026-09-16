"use client";

import { LEVEL_ORDER, LEVELS, type Level } from "@/lib/levels";
import { useI18n } from "@/lib/i18n";

/**
 * 学段选择器（PRD §7.12.3 F17）
 * 六张卡片：年龄 + 中法学制名；选中态高亮，触控区域 ≥ 48px。
 */
export function LevelPicker({
  value,
  onChange,
}: {
  value: Level;
  onChange: (level: Level) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {LEVEL_ORDER.map((id) => {
        const c = LEVELS[id];
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={active}
            aria-label={t('levelPicker.ariaLabel', { id, age: String(c.ageRange), cnName: c.cnName })}
            className={
              "min-h-[96px] rounded-2xl border-2 p-3 text-left transition " +
              (active
                ? "border-purple-500 bg-purple-50 shadow-sm"
                : "border-gray-100 bg-white hover:border-purple-200")
            }
          >
            <div className="text-2xl">{c.emoji}</div>
            <div className="mt-1 font-bold text-gray-800">
              {t('levelPicker.idAge', { id, age: String(c.ageRange) })}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{t('levelPicker.cnName', { cnName: c.cnName })}</div>
            <div className="text-xs text-gray-400">{c.frName}</div>
          </button>
        );
      })}
    </div>
  );
}
