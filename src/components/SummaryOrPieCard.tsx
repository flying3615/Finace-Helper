import { Card, Col, Row, Statistic } from 'antd';
import EChartsReact from 'echarts-for-react';

export interface SummaryOrPieCardProps {
  isAllView: boolean;
  totals: { income: number; expense: number; net: number };
  option: any;
  headerBorderColor: string;
}

export default function SummaryOrPieCard({ isAllView, totals, option, headerBorderColor }: SummaryOrPieCardProps) {
  return (
    <Card
      title={isAllView ? '收支概览' : '分类占比'}
      bordered={false}
      bodyStyle={{ padding: 0 }}
      styles={{ header: { borderBottom: `1px solid ${headerBorderColor}` } }}
    >
      <div style={{ padding: 16 }}>
        {isAllView && (
          <Row gutter={16} style={{ marginBottom: 12 }}>
            <Col span={8}>
              <Statistic title="收入" value={totals.income} precision={2} valueStyle={{ color: '#52c41a' }} />
            </Col>
            <Col span={8}>
              <Statistic title="支出" value={totals.expense} precision={2} valueStyle={{ color: '#ff4d4f' }} />
            </Col>
            <Col span={8}>
              <Statistic title="结余" value={totals.net} precision={2} valueStyle={{ color: totals.net >= 0 ? '#1677ff' : '#fa8c16' }} />
            </Col>
          </Row>
        )}
        <EChartsReact key={`main-chart-${isAllView ? 'all' : 'cat'}`} option={option} notMerge style={{ height: 360 }} />
      </div>
    </Card>
  );
}


