import { Card, Segmented, Space, Switch } from 'antd';
import EChartsReact from 'echarts-for-react';
import './MonthlyComparisonCard.css';

export interface MonthlyComparisonCardProps {
  option: any;
  metric?: 'expense' | 'income' | 'net';
  onChangeMetric?: (m: 'expense' | 'income' | 'net') => void;
  compareMode?: 'none' | 'mom' | 'yoy';
  onChangeCompare?: (m: 'none' | 'mom' | 'yoy') => void;
  forecastOn?: boolean;
  onChangeForecast?: (v: boolean) => void;
  onClickMonth?: (ym: string) => void;
}

export default function MonthlyComparisonCard(props: MonthlyComparisonCardProps) {
  const { option, metric, onChangeMetric, compareMode, onChangeCompare, forecastOn, onChangeForecast, onClickMonth } = props;
  return (
    <Card
      title={
        <Space wrap>
          <span>月份对比</span>
          {onChangeMetric && (
          <Segmented
            options={[
              { label: '支出', value: 'expense' },
              { label: '收入', value: 'income' },
              { label: '结余', value: 'net' },
            ]}
            value={metric}
            onChange={(v) => onChangeMetric(v as any)}
          />)}
          {onChangeCompare && (
          <Segmented
            options={[
              { label: '无对比', value: 'none' },
              { label: '环比', value: 'mom' },
              { label: '同比', value: 'yoy' },
            ]}
            value={compareMode}
            onChange={(v) => onChangeCompare(v as any)}
          />)}
          {onChangeForecast && (<Space>
            <span>预测</span>
            <Switch checked={forecastOn} onChange={onChangeForecast} />
          </Space>)}
        </Space>
      }
      bordered={false}
    >
      <EChartsReact
        option={option}
        className="monthly-card__chart"
        onEvents={{
          click: (params: any) => {
            const m = (params?.name ?? params?.axisValue) as string | undefined;
            if (m && /^\d{4}-\d{2}$/.test(m)) {
              onClickMonth?.(m);
            }
          },
        }}
      />
    </Card>
  );
}


