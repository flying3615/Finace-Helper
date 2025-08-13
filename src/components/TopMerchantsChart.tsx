import EChartsReact from 'echarts-for-react';

export interface TopMerchantsChartProps {
  names: string[];
  values: number[];
  color: string;
}

export default function TopMerchantsChart({ names, values, color }: TopMerchantsChartProps) {
  return (
    <EChartsReact
      option={{
        tooltip: { trigger: 'axis' },
        grid: { left: 120, right: 24 },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: names.slice().reverse() },
        series: [
          {
            type: 'bar',
            data: values.slice().reverse(),
            itemStyle: { color },
            barWidth: '55%',
          },
        ],
      }}
      style={{ height: Math.max(220, names.length * 28 + 60) }}
    />
  );
}


