import { en, type Dictionary, type TranslationKey } from './en';
import { hi } from './hi';
import { kn } from './kn';

export { en };
export type { Dictionary, TranslationKey };

export const LOCALES = ['en', 'hi', 'kn'] as const;

export type Locale = (typeof LOCALES)[number];

/** Typed as a full record, so adding a locale without a dictionary won't compile. */
export const dictionaries: Record<Locale, Dictionary> = { en, hi, kn };

/** Collapsed code for the toggle button, full endonym for the menu. */
export const LOCALE_META: Record<Locale, { short: string; full: string }> = {
  en: { short: 'EN', full: 'English' },
  hi: { short: 'हि', full: 'हिंदी' },
  kn: { short: 'ಕ', full: 'ಕನ್ನಡ' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
