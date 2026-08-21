'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useChartTheme } from './theme';

export interface CountBar {
  label: string;
  value: number;
  color: string;
}

export function CountBars({ data, height = 240 }: { data: CountBar[]; height?: number }) {
  const t = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: t.tick }}
          axisLine={{ stroke: t.axis }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: t.tick }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip
          cursor={{ fill: t.cursor }}
          contentStyle={{
            borderRadius: 12,
            border: `1px solid ${t.tooltipBorder}`,
            background: t.tooltipBg,
            fontSize: 12,
            boxShadow: '0 10px 30px -10px rgb(15 23 42 / 0.25)',
          }}
          labelStyle={{ color: t.tick }}
          itemStyle={{ color: t.tooltipText }}
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={64}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
