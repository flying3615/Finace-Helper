import EChartsReact from 'echarts-for-react';
import './AccountsBarChart.css';

export interface AccountsBarChartProps {
  names: string[];
  values: number[];
}

export default function AccountsBarChart({ names, values }: AccountsBarChartProps) {
  return (
    <EChartsReact
      className="accounts-bar-chart"
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
      
    />
  );
}


