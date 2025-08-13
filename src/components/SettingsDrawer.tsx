import { Button, Divider, Drawer, Form, Space, Typography, Upload, message } from 'antd';
import { UploadOutlined, ImportOutlined, ExportOutlined, SyncOutlined, DeleteOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import dayjs from 'dayjs';
import type { Transaction } from '../types';
import { applyRulesAsync } from '../utils/categorize';
import { normalizeMerchantsAsync } from '../utils/normalize';
import { exportCategoriesAndRules, importCategoriesAndRules, exportMerchantAliases, importMerchantAliases } from '../utils/io';
import { useRef } from 'react';
import './SettingsDrawer.css';

export interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  uploadProps: UploadProps;
  transactions: Transaction[];
  onMergeTransactions: (incoming: Transaction[]) => void;
  onClear: () => void;
}

export default function SettingsDrawer(props: SettingsDrawerProps) {
  const { open, onClose, uploadProps, transactions, onMergeTransactions, onClear } = props;
  const importTxInputRef = useRef<HTMLInputElement | null>(null);
  return (
    <Drawer title="设置" open={open} width={520} onClose={onClose} bodyStyle={{ paddingTop: 12 }}>
      <Form layout="vertical" className="settings-drawer-form">
        <Form.Item label="数据导入">
          <Upload {...uploadProps}>
            <Button type="primary" icon={<UploadOutlined />}>上传 CSV</Button>
          </Upload>
        </Form.Item>
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
            >导出账单</Button>
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
                    onMergeTransactions(withCategory);
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
            <Button icon={<DeleteOutlined />} danger onClick={onClear} disabled={transactions.length === 0}>清空数据</Button>
          </Space>
        </Form.Item>

        <Divider style={{ margin: '8px 0 16px' }} />

        <Form.Item label="分类与规则">
          <Space wrap>
            <Button
              icon={<SyncOutlined />}
              onClick={async () => {
                const reclassified = await applyRulesAsync(transactions);
                onMergeTransactions(reclassified);
                message.success('已重新按规则分类');
              }}
              disabled={transactions.length === 0}
            >重新分类</Button>
            <Button onClick={async () => {
              const blob = await exportCategoriesAndRules();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = `finance-helper-categories-${dayjs().format('YYYY-MM-DD')}.json`; a.click();
              URL.revokeObjectURL(url);
            }}>导出分类与规则</Button>
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
            <Button onClick={async () => {
              const normalized = await normalizeMerchantsAsync(transactions);
              onMergeTransactions(normalized);
              message.success('已重新归一化商户');
            }} disabled={transactions.length === 0}>重新归一化</Button>
            <Button onClick={async () => {
              const blob = await exportMerchantAliases();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = `finance-helper-merchant-aliases-${dayjs().format('YYYY-MM-DD')}.json`; a.click();
              URL.revokeObjectURL(url);
            }}>导出商户规则</Button>
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
  );
}


