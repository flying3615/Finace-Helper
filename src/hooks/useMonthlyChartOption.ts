import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import type { MonthlyAgg } from './useTransactionsStats';

export type MonthlyMetric = 'expense' | 'income' | 'net';
export type CompareMode = 'none' | 'mom' | 'yoy';

export default function useMonthlyChartOption(monthly: MonthlyAgg[], monthFilter: dayjs.Dayjs | null) {
  const [monthlyMetric, setMonthlyMetric] = useState<MonthlyMetric>('expense');
  const [compareMode, setCompareMode] = useState<CompareMode>('none');
  const [forecastOn, setForecastOn] = useState<boolean>(false);
  const [maWindow] = useState<number>(3);

  const option = useMemo(() => {
    const x = monthly.map((x) => x.month);
    const y = monthly.map((x) => (monthlyMetric === 'expense' ? x.expense : monthlyMetric === 'income' ? x.income : x.net));
    const color = monthlyMetric === 'expense' ? '#ff4d4f' : monthlyMetric === 'income' ? '#52c41a' : '#1677ff';

    let refData: Array<number | null> | null = null;
    if (compareMode !== 'none' && x.length > 0) {
      refData = new Array(x.length).fill(null);
      const monthIndex = new Map<string, number>();
      x.forEach((m, idx) => monthIndex.set(m, idx));
      for (let i = 0; i < x.length; i += 1) {
        const refKey = compareMode === 'mom'
          ? dayjs(x[i], 'YYYY-MM').add(-1, 'month').format('YYYY-MM')
          : dayjs(x[i], 'YYYY-MM').add(-1, 'year').format('YYYY-MM');
        const idx = monthIndex.get(refKey);
        if (typeof idx === 'number') refData[i] = Number(y[idx]?.toFixed(2));
      }
    }

    const xAll = [...x];
    const series: any[] = [
      { name: '本期', type: 'bar', data: y.map((n) => Number(n.toFixed(2))), barWidth: '45%', itemStyle: { color } },
    ];
    if (refData) {
      series.push({
        name: compareMode === 'mom' ? '上月' : '去年同月',
        type: 'line',
        smooth: false,
        symbolSize: 6,
        lineStyle: { type: 'dashed', width: 1.5 },
        itemStyle: { color: '#8c8c8c' },
        data: refData,
      });
    }

    let forecastPoint: { nextMonth: string; value: number } | null = null;
    if (forecastOn && x.length >= maWindow) {
      const lastN = y.slice(-maWindow);
      const avg = lastN.reduce((s, v) => s + v, 0) / maWindow;
      const nextMonth = dayjs(x[x.length - 1], 'YYYY-MM').add(1, 'month').format('YYYY-MM');
      forecastPoint = { nextMonth, value: Number(avg.toFixed(2)) };
      xAll.push(forecastPoint.nextMonth);
      const predData = new Array(xAll.length).fill(null);
      predData[predData.length - 1] = forecastPoint.value;
      series.push({
        name: '预测',
        type: 'bar',
        data: predData,
        barWidth: '45%',
        itemStyle: { color, opacity: 0.35, borderColor: color, borderType: 'dashed', borderWidth: 1 },
      });
    }

    return {
      option: {
        tooltip: {
          trigger: 'axis',
          formatter: (params: any[]) => {
            const cur = params.find((p) => p.seriesName === '本期');
            const ref = params.find((p) => p.seriesName === (compareMode === 'mom' ? '上月' : '去年同月'));
            const pred = params.find((p) => p.seriesName === '预测');
            const curVal = typeof cur?.value === 'number' ? cur.value : null;
            const refVal = typeof ref?.value === 'number' ? ref.value : null;
            const predVal = typeof pred?.value === 'number' ? pred.value : null;
            const title = params[0]?.axisValueLabel ?? '';
            const lines: string[] = [];
            if (cur) lines.push(`${cur.marker}${cur.seriesName}: ${curVal?.toFixed ? curVal.toFixed(2) : curVal}`);
            if (ref && compareMode !== 'none') lines.push(`${ref.marker}${ref.seriesName}: ${refVal?.toFixed ? refVal.toFixed(2) : refVal}`);
            if (pred) lines.push(`${pred.marker}${pred.seriesName}: ${predVal?.toFixed ? predVal.toFixed(2) : predVal}`);
            if (curVal != null && refVal != null && refVal !== 0) {
              const delta = curVal - refVal;
              const pct = (delta / Math.abs(refVal)) * 100;
              const sign = delta > 0 ? '+' : delta < 0 ? '' : '';
              lines.push(`差值: ${sign}${delta.toFixed(2)} (${sign}${pct.toFixed(1)}%)`);
            } else if (compareMode !== 'none') {
              lines.push('差值: —');
            }
            return [title, ...lines].join('<br/>');
          },
        },
        legend:
          compareMode !== 'none'
            ? { data: ['本期', compareMode === 'mom' ? '上月' : '去年同月', ...(forecastPoint ? ['预测'] : [])] }
            : forecastPoint
            ? { data: ['本期', '预测'] }
            : undefined,
        xAxis: { type: 'category', data: xAll },
        yAxis: { type: 'value' },
        series,
        axisPointer: monthFilter ? { value: monthFilter.format('YYYY-MM'), snap: true } : undefined,
      },
      state: { monthlyMetric, compareMode, forecastOn },
      setMonthlyMetric,
      setCompareMode,
      setForecastOn,
    } as const;
  }, [monthly, monthlyMetric, compareMode, monthFilter, forecastOn, maWindow]);

  return option;
}


