import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Col, DatePicker, Divider, Drawer, Form, Layout, Row, Segmented, Space, Statistic, Table, Tabs, Typography, Upload, theme, message } from 'antd';
import { SettingOutlined, UploadOutlined, ImportOutlined, ExportOutlined, SyncOutlined, DeleteOutlined, CalendarOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import EChartsReact from 'echarts-for-react';
import { parseCsv, type CsvMapping } from './utils/parseCsv';
import { applyRulesAsync } from './utils/categorize';
import CategoryManager from './components/CategoryManager';
import type { Transaction } from './types';
import './App.css';
import { db } from './store/db';
import dayjs from 'dayjs';

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
      setTransactions((prev) => mergeTransactions(prev, withCategory));
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
  const monthlyChart = useMemo(() => {
    const x = monthly.map((x) => x.month);
    const y = monthly.map((x) => (monthlyMetric === 'expense' ? x.expense : monthlyMetric === 'income' ? x.income : x.net));
    const color = monthlyMetric === 'expense' ? '#ff4d4f' : monthlyMetric === 'income' ? '#52c41a' : '#1677ff';
    return {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: x },
      yAxis: { type: 'value' },
      series: [
        { type: 'bar', data: y.map((n) => Number(n.toFixed(2))), barWidth: '45%', itemStyle: { color } },
      ],
      // 使用 axisPointer 高亮，通过 dataset 不触发重建
      axisPointer: monthFilter ? { value: monthFilter.format('YYYY-MM'), snap: true } : undefined,
    };
  }, [monthly, monthlyMetric, monthFilter]);

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
                    <Col xs={24} md={10}>
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
                    <Col xs={24} md={14}>
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
                            { title: '商户', dataIndex: 'merchant', sorter: (a: Transaction, b: Transaction) => (a.merchant ?? '').localeCompare(b.merchant ?? '') },
                            { title: '备注', dataIndex: 'note' },
                          ]}
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
                          <Space>
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
            ]}
          />
        </div>
      </Layout.Content>
    </Layout>
  );
}

export default App;
