'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

export interface ChartTheme {
  grid: string;
  axis: string;
  tick: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  cursor: string;
}

// Light/dark palettes mirror the CSS tokens in globals.css (--line, --fg-*,
// --surface) so charts sit flush with the surrounding UI in both themes.
const light: ChartTheme = {
  grid: '#e2e8f0',
  axis: '#e2e8f0',
  tick: '#64748b',
  tooltipBg: '#ffffff',
  tooltipBorder: '#e2e8f0',
  tooltipText: '#0f172a',
  cursor: 'rgb(241 243 249 / 0.7)',
};

const dark: ChartTheme = {
  grid: '#2a3352',
  axis: '#2a3352',
  tick: '#8f99b2',
  tooltipBg: '#141a2e',
  tooltipBorder: '#2a3352',
  tooltipText: '#e7eaf3',
  cursor: 'rgb(27 36 64 / 0.6)',
};

/** Theme-aware chart colors. Falls back to the light palette until mounted. */
export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && resolvedTheme === 'dark' ? dark : light;
}
