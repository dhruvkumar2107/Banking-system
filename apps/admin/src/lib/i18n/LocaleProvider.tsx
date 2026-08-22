'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  dictionaries,
  en,
  isLocale,
  type Dictionary,
  type Locale,
  type TranslationKey,
} from './dictionaries';

/** localStorage key. Namespaced like the rest of the admin console's storage. */
const STORAGE_KEY = 'pigmee.admin.locale';

/**
 * `TranslationKey | (string & {})` keeps autocomplete on the known keys while
 * still allowing composed lookups such as `` t(`status.${row.status}`) ``.
 */
export type TKey = TranslationKey | (string & {});

export type Translator = (key: TKey, vars?: Record<string, string | number>) => string;

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** False until the stored preference has been read (first paint renders English). */
  mounted: boolean;
  t: Translator;
}

const NAMED_VAR = /\{(\w+)\}/g;

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(NAMED_VAR, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/**
 * Resolution order: active locale → English → the key itself. Returning the key
 * makes a gap obvious in the UI without ever throwing inside a render.
 */
function translate(
  locale: Locale,
  key: TKey,
  vars?: Record<string, string | number>,
): string {
  const dict = dictionaries[locale] as Partial<Dictionary>;
  const fallback = en as Partial<Dictionary>;
  const raw = dict[key as TranslationKey] ?? fallback[key as TranslationKey] ?? String(key);
  return interpolate(raw, vars);
}

/**
 * Non-null default so `useT()` degrades to English instead of throwing when a
 * component renders outside the provider (deliberately unlike `useAuth`, which
 * throws — a missing label must never take a page down).
 */
const FALLBACK: LocaleState = {
  locale: 'en',
  setLocale: () => {},
  mounted: false,
  t: (key, vars) => translate('en', key, vars),
};

const LocaleContext = createContext<LocaleState>(FALLBACK);

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Always 'en' on the server and on the first client paint — the stored choice
  // is applied in the effect below, so markup matches and hydration stays quiet.
  const [locale, setLocaleState] = useState<Locale>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isLocale(stored)) setLocaleState(stored);
    } catch {
      /* private mode / storage disabled — English is a fine default */
    }
    setMounted(true);
  }, []);

  // Keep <html lang> in step for screen readers and browser hyphenation.
  useEffect(() => {
    if (mounted) document.documentElement.lang = locale;
  }, [locale, mounted]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* non-fatal: the choice just won't survive a reload */
    }
  }, []);

  const t = useCallback<Translator>(
    (key, vars) => translate(locale, key, vars),
    [locale],
  );

  const value = useMemo<LocaleState>(
    () => ({ locale, setLocale, mounted, t }),
    [locale, setLocale, mounted, t],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** Active locale plus the setter used by `<LanguageToggle />`. */
export function useLocale(): { locale: Locale; setLocale: (locale: Locale) => void; mounted: boolean } {
  const { locale, setLocale, mounted } = useContext(LocaleContext);
  return { locale, setLocale, mounted };
}

/**
 * The translator hook. Stable per locale, so it is safe in dependency arrays.
 *
 *   const t = useT();
 *   t('customers.title');
 *   t('customers.showing', { count: 42, total: 120 });
 */
export function useT(): Translator {
  return useContext(LocaleContext).t;
}
