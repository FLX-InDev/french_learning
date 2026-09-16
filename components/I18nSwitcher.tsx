"use client";

import { useCallback } from 'react';
import { useI18n, type Locale } from '@/lib/i18n';

const locales: { code: Locale; label: string }[] = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
];

export function I18nSwitcher() {
  const { locale, setLocale, t } = useI18n();

  const handleSwitch = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setLocale(e.target.value as Locale);
    },
    [setLocale],
  );

  return (
    <select
      value={locale}
      onChange={handleSwitch}
      className="text-sm font-medium text-gray-600 hover:text-purple-600 transition-colors px-2 py-1.5 rounded-full hover:bg-purple-50 border border-gray-200 bg-white cursor-pointer"
      aria-label={t('i18n.switch')}
    >
      {locales.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
