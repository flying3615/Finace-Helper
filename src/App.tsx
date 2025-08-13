import { useState } from 'react';
import { Button, Card, Col, Layout, Row, Space, Statistic, Tabs, Typography, theme } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
//
import { parseCsv, type CsvMapping } from './utils/parseCsv';
import { applyRulesAsync } from './utils/categorize';
import { normalizeMerchantsAsync } from './utils/normalize';
import CategoryManager from './components/CategoryManager';
import MerchantManager from './components/MerchantManager';
import type { Transaction } from './types';
import './App.css';
import dayjs from 'dayjs';
import useCategoryColors from './hooks/useCategoryColors';
import useTransactionsStats from './hooks/useTransactionsStats';
import useMonthlyChartOption from './hooks/useMonthlyChartOption';
import AnalysisFilterBar from './components/AnalysisFilterBar';
import SettingsDrawer from './components/SettingsDrawer';
import SummaryOrPieCard from './components/SummaryOrPieCard';
import TopMerchantsChart from './components/TopMerchantsChart';
import AccountsBarChart from './components/AccountsBarChart';
import TransactionsTable from './components/TransactionsTable';
import MonthlyComparisonCard from './components/MonthlyComparisonCard';

// 留空以自动从 CSV 表头推断；如需固定某模板，可在此覆盖
const defaultMapping: CsvMapping | undefined = undefined;

function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [view, setView] = useState<'全部' | '支出' | '收入'>('全部');
  const [monthFilter, setMonthFilter] = useState<dayjs.Dayjs | null>(null);
  const [activeTab, setActiveTab] = useState<'analysis' | 'monthly' | 'categories'>('analysis');
  const { token } = theme.useToken();
  const categoryColors = useCategoryColors();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 统计逻辑 & 月份图表（需在图表配置前准备好）
  const { filtered, totals, byCategory, byAccount, topMerchants, monthly } = useTransactionsStats(
    transactions,
    view,
    monthFilter,
  );
  const monthlyOption = useMonthlyChartOption(monthly, monthFilter);
  const { option: monthlyChart } = monthlyOption as any;

  function mergeTransactions(base: Transaction[], incoming: Transaction[]): Transaction[] {
    const makeKey = (t: Transaction) => `${t.date}|${t.amount}|${t.merchant ?? ''}|${t.account ?? ''}`;
    const seen = new Set(base.map(makeKey));
    const merged = [...base];
    for (const t of incoming) {
      const k = makeKey(t);
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(t);
      }
    }
    return merged;
  }

  const uploadProps: UploadProps = {
    accept: '.csv',
    multiple: true,
    showUploadList: false,
    beforeUpload: async (file) => {
      const parsed = await parseCsv(file, defaultMapping);
      const withCategory = await applyRulesAsync(parsed);
      const withNorm = await normalizeMerchantsAsync(withCategory);
      setTransactions((prev) => mergeTransactions(prev, withNorm));
      return false;
    },
  };

  // 统计逻辑与分组由 hooks 提供

  // byAccount/topMerchants 将由 useTransactionsStats 提供

  const isAllView = view === '全部';
  const chartOption = ((): any => {
    if (isAllView) {
      return {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: ['收入', '支出'] },
        yAxis: { type: 'value' },
        series: [
          {
            type: 'bar',
            data: [Number(totals.income.toFixed(2)), Number(totals.expense.toFixed(2))],
            itemStyle: {
              color: (params: any) => (params.dataIndex === 0 ? '#52c41a' : '#ff4d4f'),
            },
            barWidth: '40%'
          },
        ],
      };
    }
    // 饼图数据基于分类聚合与颜色
    const pieData = byCategory.map(({ name, value }) => ({
      name,
      value,
      itemStyle: categoryColors[name] ? { color: categoryColors[name] } : undefined,
    }));
    return {
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          data: pieData,
          label: { formatter: '{b}: {d}%' },
        },
      ],
    };
  })();

  // 上方已准备统计与 monthly 图表状态

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Layout.Header style={{ background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', height: 'auto', lineHeight: 'normal', padding: '12px 16px' }}>
        <div className="page-container app-header">
          <Typography.Title level={4} className="app-title">个人账单分析</Typography.Title>
          <Space className="toolbar">
            <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>设置</Button>
            <Statistic title="记录数" value={filtered.length} style={{ whiteSpace: 'nowrap' }} />
          </Space>
        </div>
      </Layout.Header>

      <Layout.Content style={{ padding: '24px 16px' }}>
        <div className="page-container">
          <SettingsDrawer
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            uploadProps={uploadProps}
            transactions={transactions}
            onMergeTransactions={(incoming) => setTransactions((prev) => mergeTransactions(prev, incoming))}
            onClear={() => { setTransactions([]); }}
          />
          <Tabs
            activeKey={activeTab}
            onChange={(k) => setActiveTab(k as any)}
            items={[
              {
                key: 'analysis',
                label: '收支分析',
                children: (
                  <>
                    <AnalysisFilterBar month={monthFilter} onChangeMonth={setMonthFilter} view={view} onChangeView={(v) => setView(v)} />

                    <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      <SummaryOrPieCard isAllView={isAllView} totals={totals} option={chartOption} headerBorderColor={token.colorSplit} />
                    </Col>
                    <Col xs={24} md={12}>
                      <Card title={`商户 Top ${Math.min(10, topMerchants.length)}（${view === '收入' ? '收入来源' : '支出商户'}）`} bordered={false}>
                        <TopMerchantsChart names={topMerchants.map((d) => d.name)} values={topMerchants.map((d) => d.value)} color={view === '收入' ? '#52c41a' : '#ff7a45'} />
                      </Card>
                    </Col>
                    <Col xs={24}>
                      <Card title="账户收支对比" bordered={false}>
                        <AccountsBarChart names={byAccount.map((x) => x.name)} values={byAccount.map((x) => x.value)} />
                      </Card>
                    </Col>
                    <Col xs={24}>
                      <Card title="明细" bordered={false} styles={{ header: { borderBottom: `1px solid ${token.colorSplit}` } }}>
                        <TransactionsTable data={filtered} />
                      </Card>
                    </Col>
                  </Row>
                  </>
                ),
              },
              {
                key: 'monthly',
                label: '按月对比',
                children: (
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <MonthlyComparisonCard
                        option={monthlyChart}
                        onClickMonth={(ym) => { setMonthFilter(dayjs(ym, 'YYYY-MM')); setActiveTab('analysis'); }}
                      />
                    </Col>
                  </Row>
                ),
              },
              {
                key: 'categories',
                label: '分类管理',
                children: (
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <CategoryManager />
                    </Col>
                  </Row>
                ),
              },
              {
                key: 'merchants',
                label: '商户管理',
                children: (
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <MerchantManager />
                    </Col>
                  </Row>
                ),
              },
            ]}
          />
        </div>
      </Layout.Content>
    </Layout>
  );
}

export default App;
