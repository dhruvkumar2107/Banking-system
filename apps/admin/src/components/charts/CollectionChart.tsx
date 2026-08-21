'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { inr, inrCompact } from '@/lib/format';
import { useChartTheme } from './theme';

export interface CollectionPoint {
  label: string;
  paise: number;
}

export function CollectionChart({ data, height = 280 }: { data: CollectionPoint[]; height?: number }) {
  const t = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="collectGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
            <stop offset="55%" stopColor="#8b5cf6" stopOpacity={0.12} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="collectLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="55%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: t.tick }}
          axisLine={{ stroke: t.axis }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={(v) => inrCompact(Number(v))}
          tick={{ fontSize: 11, fill: t.tick }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip
          formatter={(v) => [inr(Number(v)), 'Collected']}
          contentStyle={{
            borderRadius: 12,
            border: `1px solid ${t.tooltipBorder}`,
            background: t.tooltipBg,
            fontSize: 12,
            boxShadow: '0 10px 30px -10px rgb(15 23 42 / 0.25)',
          }}
          labelStyle={{ color: t.tick }}
          itemStyle={{ color: t.tooltipText }}
          cursor={{ stroke: '#8b5cf6', strokeWidth: 1, strokeDasharray: '4 4' }}
        />
        <Area
          type="monotone"
          dataKey="paise"
          stroke="url(#collectLine)"
          strokeWidth={2.5}
          fill="url(#collectGrad)"
          activeDot={{ r: 5, fill: '#8b5cf6', stroke: '#fff', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
