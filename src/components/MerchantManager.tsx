import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Modal, Space, Switch, Table, Typography, message } from 'antd';
import { db } from '../store/db';
import type { MerchantAlias } from '../types';

export default function MerchantManager() {
  const [data, setData] = useState<MerchantAlias[]>([]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<MerchantAlias>();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const list = await db.merchantAliases.orderBy('createdAt').toArray();
      if (mounted) setData(list);
    };
    load();
    const i = setInterval(load, 800);
    return () => {
      mounted = false;
      clearInterval(i);
    };
  }, []);

  return (
    <Card
      title="商户管理（归一化规则）"
      bordered={false}
      extra={<Button type="primary" onClick={() => setOpen(true)}>新增规则</Button>}
    >
      <Typography.Paragraph type="secondary">
        使用正则将同一品牌不同门店归一化为同一商户名。如：`/Pak\s*N\s*Save/i` → `Pak N Save`。
      </Typography.Paragraph>
      <Table
        rowKey={(r) => String(r.id)}
        size="small"
        dataSource={data}
        pagination={{ pageSize: 8 }}
        columns={[
          { title: '规则', dataIndex: 'pattern', render: (v, r) => <Typography.Text code>{`/${v}/${r.flags ?? ''}`}</Typography.Text> },
          { title: '标准商户名', dataIndex: 'canonicalName' },
          {
            title: '启用',
            dataIndex: 'enabled',
            render: (v: boolean, r) => (
              <Switch checked={v} onChange={async (val) => { await db.merchantAliases.update(r.id!, { enabled: val }); }} />
            ),
          },
          {
            title: '操作',
            render: (_: any, r) => (
              <Space>
                <Button size="small" onClick={() => onEdit(r)}>编辑</Button>
                <Button size="small" danger onClick={async () => { await db.merchantAliases.delete(r.id!); }}>删除</Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="新增/编辑商户规则"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form<MerchantAlias>
          layout="vertical"
          form={form}
          initialValues={{ enabled: true }}
          onFinish={async (values) => {
            try {
              if (!values.pattern || !values.canonicalName) return message.error('请填写完整');
              // 验证正则
              // eslint-disable-next-line no-new
              new RegExp(values.pattern, values.flags ?? 'i');
              if ((values as any).id) {
                const id = (values as any).id as number;
                await db.merchantAliases.update(id, {
                  pattern: values.pattern,
                  flags: values.flags ?? 'i',
                  canonicalName: values.canonicalName,
                  enabled: values.enabled ?? true,
                });
              } else {
                await db.merchantAliases.add({
                  pattern: values.pattern,
                  flags: values.flags ?? 'i',
                  canonicalName: values.canonicalName,
                  enabled: values.enabled ?? true,
                  createdAt: Date.now(),
                });
              }
              setOpen(false);
            } catch {
              message.error('正则不合法');
            }
          }}
        >
          <Form.Item name="pattern" label="正则表达式" rules={[{ required: true }]}>
            <Input placeholder="如：Pak\s*N\s*Save|Pak N Save" />
          </Form.Item>
          <Form.Item name="flags" label="修饰符">
            <Input placeholder="如：i（忽略大小写）" />
          </Form.Item>
          <Form.Item name="canonicalName" label="标准商户名" rules={[{ required: true }]}>
            <Input placeholder="如：Pak N Save" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );

  function onEdit(r: MerchantAlias) {
    form.setFieldsValue({ ...(r as any) });
    (form as any).setFieldValue('id', r.id);
    setOpen(true);
  }
}


