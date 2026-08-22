/**
 * Client-side i18n for the admin console.
 *
 * A React context + `localStorage` — no route-based locales, no extra deps.
 * English (`en.ts`) is the source of truth: `hi.ts` and `kn.ts` are typed as
 * `Record<keyof typeof en, string>`, so a missing translation is a build error.
 *
 *   import { useT, useLocale } from '@/lib/i18n';
 *
 *   const t = useT();
 *   <h1>{t('customers.title')}</h1>
 *   <p>{t('customers.showing', { count: rows.length, total })}</p>
 */
export { LocaleProvider, useLocale, useT } from './LocaleProvider';
export type { TKey, Translator } from './LocaleProvider';

export { LOCALES, LOCALE_META, dictionaries, en, isLocale } from './dictionaries';
export type { Dictionary, Locale, TranslationKey } from './dictionaries';
