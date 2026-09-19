"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useI18n, localizedHref, pathWithoutLocale, type Locale } from '@/lib/i18n';

/** 内联 SVG 国旗（原生 <option> 在 Windows 上不渲染 emoji 国旗，故自绘） */
function FlagZH({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 20" className={className} aria-hidden="true">
      <rect width="30" height="20" fill="#DE2910" />
      <polygon
        points="5.9,2 6.6,4.1 8.9,4.1 7,5.5 7.7,7.7 5.9,6.3 4.1,7.7 4.8,5.5 2.9,4.1 5.2,4.1"
        fill="#FFDE00"
      />
    </svg>
  );
}

function FlagEN({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 30" className={className} aria-hidden="true">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="2.5" />
      <rect x="25" width="10" height="30" fill="#fff" />
      <rect y="10" width="60" height="10" fill="#fff" />
      <rect x="27" width="6" height="30" fill="#C8102E" />
      <rect y="12" width="60" height="6" fill="#C8102E" />
    </svg>
  );
}

function FlagFR({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 20" className={className} aria-hidden="true">
      <rect width="10" height="20" fill="#0055A4" />
      <rect x="10" width="10" height="20" fill="#fff" />
      <rect x="20" width="10" height="20" fill="#EF4135" />
    </svg>
  );
}

const locales: { code: Locale; label: string; Flag: typeof FlagZH }[] = [
  { code: 'zh', label: '中文', Flag: FlagZH },
  { code: 'en', label: 'English', Flag: FlagEN },
  { code: 'fr', label: 'Français', Flag: FlagFR },
];

export function I18nSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  /** 语言 = URL 真源（C1 方案①）：先写设置，再把前缀替换到目标语言的同一路由 */
  const switchLocale = useCallback(
    (next: Locale) => {
      setLocale(next);
      router.push(localizedHref(next, pathWithoutLocale(pathname)));
      close();
    },
    [setLocale, router, pathname, close]
  );

  // 点击外部 / Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const current = locales.find((l) => l.code === locale) ?? locales[0];
  const CurrentFlag = current.Flag;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('i18n.switch')}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-purple-600 transition-colors px-2.5 py-1.5 rounded-full hover:bg-purple-50 border border-gray-200 bg-white cursor-pointer"
      >
        <CurrentFlag className="w-5 h-3.5 rounded-[2px] shadow-sm shrink-0" />
        <span>{current.label}</span>
        <span
          className={
            'text-[10px] text-gray-400 transition-transform ' +
            (open ? 'rotate-180' : '')
          }
        >
          ▼
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t('i18n.switch')}
          className="absolute right-0 mt-1 z-50 min-w-[150px] rounded-xl border border-gray-100 bg-white shadow-lg py-1 overflow-hidden"
        >
          {locales.map(({ code, label, Flag }) => (
            <li key={code}>
              <button
                type="button"
                role="option"
                aria-selected={code === locale}
                onClick={() => switchLocale(code)}
                className={
                  'flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer ' +
                  (code === locale
                    ? 'bg-purple-50 text-purple-700 font-semibold'
                    : 'text-gray-600 hover:bg-purple-50/60')
                }
              >
                <Flag className="w-5 h-3.5 rounded-[2px] shadow-sm shrink-0" />
                <span className="flex-1">{label}</span>
                {code === locale && <span className="text-purple-500 text-xs">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
