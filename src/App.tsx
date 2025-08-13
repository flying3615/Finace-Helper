import { useEffect, useMemo, useState } from 'react';
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
import { db } from './store/db';
import dayjs from 'dayjs';
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
  const [categoryColors, setCategoryColors] = useState<Record<string, string | undefined>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 刷新分类颜色（安全方案：低频轮询 + 比较，避免 Dexie Observable 依赖）
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const cats = await db.categories.toArray();
      if (!mounted) return;
      const map: Record<string, string | undefined> = {};
      for (const c of cats) {
        if (c.name) map[c.name] = typeof c.color === 'string' ? c.color : undefined;
      }
      setCategoryColors((prev) => {
        const prevStr = JSON.stringify(prev);
        const nextStr = JSON.stringify(map);
        return prevStr === nextStr ? prev : map;
      });
    };
    load();
    const timer = setInterval(load, 2000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

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

  const baseByMonth = useMemo(() => {
    if (!monthFilter) return transactions;
    return transactions.filter((t) => dayjs(t.date).isValid() && dayjs(t.date).isSame(monthFilter, 'month'));
  }, [transactions, monthFilter]);

  const filtered = useMemo(() => {
    const flowOf = (t: Transaction) => (t.flow ?? (t.amount > 0 ? '收入' : '支出'));
    if (view === '支出') return baseByMonth.filter((t) => flowOf(t) === '支出');
    if (view === '收入') return baseByMonth.filter((t) => flowOf(t) === '收入');
    return baseByMonth.filter((t) => flowOf(t) !== '转账');
  }, [baseByMonth, view]);

  const totals = useMemo(() => {
    const flowOf = (t: Transaction) => (t.flow ?? (t.amount > 0 ? '收入' : '支出'));
    const income = baseByMonth.filter((t) => flowOf(t) === '收入').reduce((s, t) => s + t.amount, 0);
    const expense = Math.abs(baseByMonth.filter((t) => flowOf(t) === '支出').reduce((s, t) => s + t.amount, 0));
    const net = income - expense;
    return { income, expense, net };
  }, [baseByMonth]);

  const byCategory = useMemo(() => {
    const sumByCategory = new Map<string, number>();
    for (const t of filtered) {
      const key = t.category ?? '未分类';
      sumByCategory.set(key, (sumByCategory.get(key) ?? 0) + Math.abs(t.amount));
    }
    return Array.from(sumByCategory, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const pieData = useMemo(() => {
    return byCategory.map(({ name, value }) => ({
      name,
      value,
      itemStyle: categoryColors[name] ? { color: categoryColors[name] } : undefined,
    }));
  }, [byCategory, categoryColors]);

  const byAccount = useMemo(() => {
    const sumByAcc = new Map<string, number>();
    for (const t of baseByMonth) {
      const key = t.account ?? '未标记';
      sumByAcc.set(key, (sumByAcc.get(key) ?? 0) + t.amount);
    }
    return Array.from(sumByAcc, ([name, value]) => ({ name, value: Number(value.toFixed(2)) }));
  }, [baseByMonth]);

  const topMerchants = useMemo(() => {
    const isIncome = view === '收入';
    const isExpense = view === '支出' || view === '全部';
    const agg = new Map<string, number>();
    for (const t of filtered) {
      const name = t.merchantNorm ?? t.merchant ?? '未知商户';
      if (!name) continue;
      if (isIncome && t.amount > 0) {
        agg.set(name, (agg.get(name) ?? 0) + t.amount);
      } else if (isExpense && t.amount < 0) {
        agg.set(name, (agg.get(name) ?? 0) + Math.abs(t.amount));
      }
    }
    const arr = Array.from(agg, ([name, value]) => ({ name, value: Number(value.toFixed(2)) }));
    arr.sort((a, b) => b.value - a.value);
    return arr.slice(0, 10);
  }, [filtered, view]);

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

  // 月份对比：基于所有已导入交易，按月聚合（排除转账）
  const monthly = useMemo(() => {
    const flowOf = (t: Transaction) => (t.flow ?? (t.amount > 0 ? '收入' : '支出'));
    const m = new Map<string, { income: number; expense: number; net: number }>();
    for (const t of transactions) {
      if (flowOf(t) === '转账') continue;
      const ym = dayjs(t.date).isValid() ? dayjs(t.date).format('YYYY-MM') : '未知';
      if (!m.has(ym)) m.set(ym, { income: 0, expense: 0, net: 0 });
      const obj = m.get(ym)!;
      if (flowOf(t) === '收入') obj.income += t.amount; else obj.expense += Math.abs(t.amount);
      obj.net = obj.income - obj.expense;
    }
    const arr = Array.from(m, ([month, v]) => ({ month, ...v }));
    arr.sort((a, b) => a.month.localeCompare(b.month));
    return arr;
  }, [transactions]);

  const [monthlyMetric, setMonthlyMetric] = useState<'expense' | 'income' | 'net'>('expense');
  const [compareMode, setCompareMode] = useState<'none' | 'mom' | 'yoy'>('none');
  const [forecastOn, setForecastOn] = useState<boolean>(false);
  const [maWindow] = useState<number>(3);
  const monthlyChart = useMemo(() => {
    const x = monthly.map((x) => x.month);
    const y = monthly.map((x) => (monthlyMetric === 'expense' ? x.expense : monthlyMetric === 'income' ? x.income : x.net));
    const color = monthlyMetric === 'expense' ? '#ff4d4f' : monthlyMetric === 'income' ? '#52c41a' : '#1677ff';

    // 对比序列
    let refData: Array<number | null> | null = null;
    if (compareMode !== 'none' && x.length > 0) {
      refData = new Array(x.length).fill(null);
      if (compareMode === 'mom') {
        const monthIndex = new Map<string, number>();
        x.forEach((m, idx) => monthIndex.set(m, idx));
        for (let i = 0; i < x.length; i += 1) {
          const prevMonth = dayjs(x[i], 'YYYY-MM').add(-1, 'month').format('YYYY-MM');
          const idx = monthIndex.get(prevMonth);
          if (typeof idx === 'number') refData[i] = Number(y[idx]?.toFixed(2));
        }
      } else if (compareMode === 'yoy') {
        const monthIndex = new Map<string, number>();
        x.forEach((m, idx) => monthIndex.set(m, idx));
        for (let i = 0; i < x.length; i += 1) {
          const lastYear = dayjs(x[i], 'YYYY-MM').add(-1, 'year').format('YYYY-MM');
          const idx = monthIndex.get(lastYear);
          if (typeof idx === 'number') refData[i] = Number(y[idx]?.toFixed(2));
        }
      }
    }

    // 构造序列与横轴（含预测）
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
    // 简单预测：MA(3)
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
    };
  }, [monthly, monthlyMetric, compareMode, monthFilter, forecastOn, maWindow]);

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
                        metric={monthlyMetric}
                        onChangeMetric={(m) => setMonthlyMetric(m)}
                        compareMode={compareMode}
                        onChangeCompare={(m) => setCompareMode(m)}
                        forecastOn={forecastOn}
                        onChangeForecast={setForecastOn}
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
