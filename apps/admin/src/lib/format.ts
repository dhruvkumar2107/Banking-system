import type { Money } from './types';

/** Render a Money object (API returns paise + display). Falls back gracefully. */
export function money(m?: Money | null): string {
  if (!m) return '—';
  if (typeof m.display === 'string' && m.display.length) return m.display;
  return inr(m.paise ?? 0);
}

/** Format raw integer paise as Indian-rupee currency. */
export function inr(paise: number): string {
  const rupees = (Number(paise) || 0) / 100;
  return (
    '₹' +
    rupees.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** Compact rupee value for chart axes (₹1.2K, ₹3.4L). */
export function inrCompact(paise: number): string {
  const rupees = (Number(paise) || 0) / 100;
  if (rupees >= 1_00_00_000) return '₹' + (rupees / 1_00_00_000).toFixed(1) + 'Cr';
  if (rupees >= 1_00_000) return '₹' + (rupees / 1_00_000).toFixed(1) + 'L';
  if (rupees >= 1_000) return '₹' + (rupees / 1_000).toFixed(1) + 'K';
  return '₹' + Math.round(rupees);
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** For chart tick labels — "12 Aug". */
export function formatDayShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function relativeTime(iso?: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return formatDate(iso);
}

/** Never render a full account number — show only the last 4 digits. */
export function maskAccount(acc?: string | null): string {
  if (!acc) return '—';
  const digits = acc.replace(/\s+/g, '');
  if (digits.length <= 4) return digits;
  return '••••' + digits.slice(-4);
}

export function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/** ISO date (yyyy-mm-dd) for `n` days ago at local midnight. */
export function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function isoStartOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function isoEndOfToday(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/** yyyy-mm-dd value for <input type="date">. */
export function toDateInput(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
