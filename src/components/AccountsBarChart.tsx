import EChartsReact from 'echarts-for-react';

export interface AccountsBarChartProps {
  names: string[];
  values: number[];
}

export default function AccountsBarChart({ names, values }: AccountsBarChartProps) {
  return (
    <EChartsReact
      option={{
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: names },
        yAxis: { type: 'value' },
        series: [
          {
            type: 'bar',
            data: values,
            itemStyle: { color: (p: any) => (p.value >= 0 ? '#52c41a' : '#ff4d4f') },
            barWidth: '40%',
          },
        ],
      }}
      style={{ height: 260 }}
    />
  );
}


