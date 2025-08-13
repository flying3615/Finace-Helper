import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Col, DatePicker, Divider, Drawer, Form, Layout, Row, Segmented, Space, Statistic, Table, Tabs, Typography, Upload, theme, message, Switch } from 'antd';
import { SettingOutlined, UploadOutlined, ImportOutlined, ExportOutlined, SyncOutlined, DeleteOutlined, CalendarOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import EChartsReact from 'echarts-for-react';
import { parseCsv, type CsvMapping } from './utils/parseCsv';
import { applyRulesAsync } from './utils/categorize';
import { normalizeMerchantsAsync } from './utils/normalize';
import CategoryManager from './components/CategoryManager';
import MerchantManager from './components/MerchantManager';
import type { Transaction } from './types';
import './App.css';
import { db } from './store/db';
import dayjs from 'dayjs';
import { exportCategoriesAndRules, importCategoriesAndRules, exportMerchantAliases, importMerchantAliases } from './utils/io';

// 留空以自动从 CSV 表头推断；如需固定某模板，可在此覆盖
const defaultMapping: CsvMapping | undefined = undefined;

function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [view, setView] = useState<'全部' | '支出' | '收入'>('全部');
  const [monthFilter, setMonthFilter] = useState<dayjs.Dayjs | null>(null);
  const [activeTab, setActiveTab] = useState<'analysis' | 'monthly' | 'categories'>('analysis');
  const { token } = theme.useToken();
  const [categoryColors, setCategoryColors] = useState<Record<string, string | undefined>>({});
  const importTxInputRef = useRef<HTMLInputElement | null>(null);
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
          <Drawer
            title="设置"
            open={settingsOpen}
            width={520}
            onClose={() => setSettingsOpen(false)}
            bodyStyle={{ paddingTop: 12 }}
          >
            <Form layout="vertical" className="settings-drawer-form">
              <Form.Item label="数据导入">
                <Upload {...uploadProps}>
                  <Button type="primary" icon={<UploadOutlined />}>上传 CSV</Button>
                </Upload>
              </Form.Item>
              <Divider style={{ margin: '8px 0 16px' }} />
              {/* 筛选控件已移至“收支分析”Tab */}
              <Divider style={{ margin: '8px 0 16px' }} />
              <Form.Item label="账单备份">
                <Space wrap>
                  <Button
                    icon={<ExportOutlined />}
                    onClick={() => {
                      const payload = { version: 1, exportedAt: Date.now(), transactions } as const;
                      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      const date = dayjs().format('YYYY-MM-DD');
                      a.href = url;
                      a.download = `finance-helper-transactions-${date}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    disabled={transactions.length === 0}
                  >
                    导出账单
                  </Button>
                  <Button icon={<ImportOutlined />} onClick={() => importTxInputRef.current?.click()}>导入账单</Button>
                  <input
                    type="file"
                    ref={importTxInputRef}
                    style={{ display: 'none' }}
                    accept="application/json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const text = await file.text();
                        const json = JSON.parse(text);
                        if (!json || !Array.isArray(json.transactions)) {
                          message.error('导入失败：格式不正确');
                        } else {
                          const incoming: Transaction[] = json.transactions as Transaction[];
                          const withCategory = await applyRulesAsync(incoming);
                          setTransactions((prev) => mergeTransactions(prev, withCategory));
                          message.success(`已导入 ${withCategory.length} 条`);
                        }
                      } catch {
                        message.error('导入失败');
                      } finally {
                        if (importTxInputRef.current) importTxInputRef.current.value = '';
                      }
                    }}
                  />
                </Space>
              </Form.Item>
              <Divider style={{ margin: '8px 0 16px' }} />
              <Form.Item label="操作">
                <Space wrap>
                  <Button
                    icon={<DeleteOutlined />}
                    danger
                    onClick={() => {
                      setTransactions([]);
                      message.success('已清空数据');
                    }}
                    disabled={transactions.length === 0}
                  >
                    清空数据
                  </Button>
                </Space>
              </Form.Item>
              <Divider style={{ margin: '8px 0 16px' }} />
              <Form.Item label="分类与规则">
                <Space wrap>
                  <Button
                    icon={<SyncOutlined />}
                    onClick={async () => {
                      const reclassified = await applyRulesAsync(transactions);
                      setTransactions(reclassified);
                      message.success('已重新按规则分类');
                    }}
                    disabled={transactions.length === 0}
                  >
                    重新分类
                  </Button>
                  <Button
                    onClick={async () => {
                      const blob = await exportCategoriesAndRules();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = `finance-helper-categories-${dayjs().format('YYYY-MM-DD')}.json`; a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >导出分类与规则</Button>
                  <Button onClick={() => (document.getElementById('import-cats') as HTMLInputElement)?.click()}>导入分类与规则</Button>
                  <input id="import-cats" type="file" accept="application/json" style={{ display: 'none' }} onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    try { const json = JSON.parse(await f.text()); await importCategoriesAndRules(json); message.success('已导入分类与规则'); }
                    catch { message.error('导入失败'); }
                    finally { (e.target as HTMLInputElement).value = ''; }
                  }} />
                </Space>
                <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                  说明：重新分类会根据当前的分类规则为所有已导入交易重新打标签，不会修改原始导入数据。
                </Typography.Paragraph>
              </Form.Item>
              <Form.Item label="商户规则">
                <Space wrap>
                  <Button
                    onClick={async () => {
                      const normalized = await normalizeMerchantsAsync(transactions);
                      setTransactions(normalized);
                      message.success('已重新归一化商户');
                    }}
                    disabled={transactions.length === 0}
                  >
                    重新归一化
                  </Button>
                  <Button
                    onClick={async () => {
                      const blob = await exportMerchantAliases();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = `finance-helper-merchant-aliases-${dayjs().format('YYYY-MM-DD')}.json`; a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >导出商户规则</Button>
                  <Button onClick={() => (document.getElementById('import-merchants') as HTMLInputElement)?.click()}>导入商户规则</Button>
                  <input id="import-merchants" type="file" accept="application/json" style={{ display: 'none' }} onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    try { const json = JSON.parse(await f.text()); await importMerchantAliases(json); message.success('已导入商户规则'); }
                    catch { message.error('导入失败'); }
                    finally { (e.target as HTMLInputElement).value = ''; }
                  }} />
                </Space>
                <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                  说明：重新归一化会基于商户规则统一商户名称（如合并不同门店），明细与统计优先显示归一化结果。
                </Typography.Paragraph>
              </Form.Item>
            </Form>
          </Drawer>
          <Tabs
            activeKey={activeTab}
            onChange={(k) => setActiveTab(k as any)}
            items={[
              {
                key: 'analysis',
                label: '收支分析',
                children: (
                  <>
                    <div className="filter-bar">
                      <Space wrap>
                      <DatePicker
                        picker="month"
                        allowClear
                        placeholder="选择月份（空=全部）"
                        value={monthFilter}
                        onChange={(v) => setMonthFilter(v)}
                        style={{ width: 180 }}
                        suffixIcon={<CalendarOutlined />}
                      />
                      <Button onClick={() => setMonthFilter(dayjs())}>本月</Button>
                      <Button onClick={() => setMonthFilter(dayjs().add(-1, 'month'))}>上月</Button>
                      <Segmented
                        options={['全部', '支出', '收入']}
                        value={view}
                        onChange={(v) => setView(v as any)}
                      />
                      </Space>
      </div>

                    <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      <Card
                        title={isAllView ? '收支概览' : '分类占比'}
                        bordered={false}
                        bodyStyle={{ padding: 0 }}
                        styles={{ header: { borderBottom: `1px solid ${token.colorSplit}` } }}
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
                          <EChartsReact
                            key={`main-chart-${isAllView ? 'all' : 'cat'}`}
                            option={chartOption}
                            notMerge
                            style={{ height: 360 }}
                          />
      </div>
                      </Card>
                    </Col>
                    <Col xs={24} md={12}>
                      <Card title={`商户 Top ${Math.min(10, topMerchants.length)}（${view === '收入' ? '收入来源' : '支出商户'}）`} bordered={false}>
                        <EChartsReact
                          option={{
                            tooltip: { trigger: 'axis' },
                            grid: { left: 120, right: 24 },
                            xAxis: { type: 'value' },
                            yAxis: { type: 'category', data: topMerchants.map((d) => d.name).reverse() },
                            series: [
                              {
                                type: 'bar',
                                data: topMerchants.map((d) => d.value).reverse(),
                                itemStyle: { color: view === '收入' ? '#52c41a' : '#ff7a45' },
                                barWidth: '55%',
                              },
                            ],
                          }}
                          style={{ height: Math.max(220, topMerchants.length * 28 + 60) }}
                        />
                      </Card>
                    </Col>
                    <Col xs={24}>
                      <Card title="账户收支对比" bordered={false}>
                        <EChartsReact
                          option={{
                            tooltip: { trigger: 'axis' },
                            xAxis: { type: 'category', data: byAccount.map((x) => x.name) },
                            yAxis: { type: 'value' },
                            series: [
                              {
                                type: 'bar',
                                data: byAccount.map((x) => x.value),
                                itemStyle: { color: (p: any) => (p.value >= 0 ? '#52c41a' : '#ff4d4f') },
                                barWidth: '40%',
                              },
                            ],
                          }}
                          style={{ height: 260 }}
                        />
                      </Card>
                    </Col>
                    <Col xs={24}>
                      <Card
                        title="明细"
                        bordered={false}
                        styles={{ header: { borderBottom: `1px solid ${token.colorSplit}` } }}
                      >
                        <Table
                          size="small"
                          rowKey="id"
                          dataSource={filtered}
                          pagination={{ pageSize: 10 }}
                          columns={[
                            {
                              title: '日期',
                              dataIndex: 'date',
                              width: 110,
                              sorter: (a: Transaction, b: Transaction) => a.date.localeCompare(b.date),
                            },
                            {
                              title: '金额',
                              dataIndex: 'amount',
                              render: (v: number) => v.toFixed(2),
                              width: 120,
                              sorter: (a: Transaction, b: Transaction) => a.amount - b.amount,
                              sortDirections: ['descend', 'ascend'],
                            },
                            { title: '账户', dataIndex: 'account', width: 140 },
                            { title: '分类', dataIndex: 'category', width: 120, sorter: (a: Transaction, b: Transaction) => (a.category ?? '').localeCompare(b.category ?? '') },
                            { title: '商户', dataIndex: 'merchantNorm', render: (_: any, r: Transaction) => r.merchantNorm ?? r.merchant, sorter: (a: Transaction, b: Transaction) => (a.merchantNorm ?? a.merchant ?? '').localeCompare(b.merchantNorm ?? b.merchant ?? '') },
                            { title: '备注', dataIndex: 'note' },
                          ]}
                          />
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
                      <Card
                        title={
                          <Space wrap>
                            <span>月份对比</span>
                            <Segmented
                              options={[
                                { label: '支出', value: 'expense' },
                                { label: '收入', value: 'income' },
                                { label: '结余', value: 'net' },
                              ]}
                              value={monthlyMetric}
                              onChange={(v) => setMonthlyMetric(v as any)}
                            />
                            <Segmented
                              options={[
                                { label: '无对比', value: 'none' },
                                { label: '环比', value: 'mom' },
                                { label: '同比', value: 'yoy' },
                              ]}
                              value={compareMode}
                              onChange={(v) => setCompareMode(v as any)}
                            />
                            <Space>
                              <span>预测</span>
                              <Switch checked={forecastOn} onChange={setForecastOn} />
                            </Space>
                          </Space>
                        }
                        bordered={false}
                      >
                        <EChartsReact
                          option={monthlyChart}
                          style={{ height: 360 }}
                          onEvents={{
                            click: (params: any) => {
                              const m = (params?.name ?? params?.axisValue) as string | undefined;
                              if (m && /^\d{4}-\d{2}$/.test(m)) {
                                setMonthFilter(dayjs(m, 'YYYY-MM'));
                                setActiveTab('analysis');
                              }
                            },
                          }}
                        />
                      </Card>
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
