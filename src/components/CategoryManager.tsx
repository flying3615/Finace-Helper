import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, ColorPicker, Form, Input, Modal, Segmented, Space, Table, Tag, Typography, message, Select, Switch } from 'antd';
import { db } from '../store/db';
import type { Category, CategoryRule, CategoryType } from '../types';

function useLiveQuery<T>(query: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let mounted = true;
    query().then((d) => mounted && setData(d));
    const i = setInterval(() => {
      query().then((d) => mounted && setData(d));
    }, 500);
    return () => {
      mounted = false;
      clearInterval(i);
    };
  }, deps);
  return data;
}

export default function CategoryManager() {
  const categories = useLiveQuery(() => db.categories.orderBy('createdAt').toArray(), []);
  const rules = useLiveQuery(() => db.rules.orderBy('createdAt').toArray(), []);

  const [visible, setVisible] = useState(false);
  const [form] = Form.useForm<Category>();
  const [ruleForm] = Form.useForm<{ pattern: string }>();
  const [ruleModalVisible, setRuleModalVisible] = useState(false);
  const [currentCategoryId, setCurrentCategoryId] = useState<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // 一次性数据清理：将历史保存的非字符串颜色清空，避免渲染出错
  useEffect(() => {
    (async () => {
      const list = await db.categories.toArray();
      for (const c of list) {
        if (c.color && typeof c.color !== 'string' && typeof c.id === 'number') {
          await db.categories.update(c.id, { color: undefined });
        }
      }
    })();
  }, []);

  const categoriesMap = useMemo(() => {
    const m = new Map<number, Category>();
    (categories ?? []).forEach((c) => c.id && m.set(c.id, c));
    return m;
  }, [categories]);

  return (
    <Card
      title="分类管理"
      bordered={false}
      extra={<Button type="primary" onClick={() => setVisible(true)}>新增分类</Button>}
    >
      <Typography.Paragraph type="secondary">
        创建常用分类，并为分类添加“匹配规则”（正则），系统导入交易时会按照规则自动归类。
      </Typography.Paragraph>

      <input
        type="file"
        ref={importInputRef}
        style={{ display: 'none' }}
        accept="application/json"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const text = await file.text();
            const json = JSON.parse(text);
            await importData(json);
            message.success('导入完成');
          } catch (err) {
            message.error('导入失败：文件格式不正确');
          } finally {
            if (importInputRef.current) importInputRef.current.value = '';
          }
        }}
      />

      <Table
        size="small"
        rowKey={(r) => String(r.id)}
        dataSource={categories ?? []}
        pagination={false}
        columns={[
          {
            title: '名称',
            dataIndex: 'name',
            render: (v: string, r: Category) => {
              const colorStr = typeof r.color === 'string' ? r.color : undefined;
              return (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: colorStr || '#8c8c8c',
                    color: '#fff',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.06) inset',
                    maxWidth: '100%',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                  }}
                  title={v}
                >
                  {v}
                </span>
              );
            },
          },
          { title: '类型', dataIndex: 'type' },
          {
            title: '规则数',
            render: (_: any, r: Category) => (rules ?? []).filter((x) => x.categoryId === r.id).length,
          },
          {
            title: '操作',
            render: (_: any, r: Category) => (
              <Space>
                <Button
                  size="small"
                  disabled={!r.id}
                  onClick={() => {
                    if (!r.id) return message.warning('请先保存该分类后再添加规则');
                    setCurrentCategoryId(r.id);
                    ruleForm.resetFields();
                    setRuleModalVisible(true);
                  }}
                >
                  添加规则
                </Button>
                <Button size="small" danger disabled={!r.id} onClick={() => removeCategory(r.id!)}>删除</Button>
              </Space>
            ),
          },
        ]}
      />

      <RulesTable rules={rules ?? []} categoriesMap={categoriesMap} />

      <Modal
        title="新增分类"
        open={visible}
        onCancel={() => setVisible(false)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form<Category>
          form={form}
          layout="vertical"
          initialValues={{ type: '全部' as CategoryType }}
          onFinish={async (values) => {
            await db.categories.add({ ...values, createdAt: Date.now() });
            setVisible(false);
          }}
        >
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="如：餐饮、超市、交通" />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Segmented options={[{ label: '全部', value: '全部' }, { label: '支出', value: '支出' }, { label: '收入', value: '收入' }]} />
          </Form.Item>
          <Form.Item
            name="color"
            label="颜色"
            trigger="onChange"
            getValueFromEvent={(_value, hex) => hex}
          >
            <ColorPicker allowClear />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="添加规则"
        open={ruleModalVisible}
        onCancel={() => setRuleModalVisible(false)}
        onOk={() => ruleForm.submit()}
        destroyOnClose
      >
        <Form<{ pattern: string }>
          form={ruleForm}
          layout="vertical"
          onFinish={async (values) => {
            if (!values.pattern) return message.error('请输入规则');
            if (currentCategoryId == null) return message.error('分类无效');
            await db.rules.add({ pattern: values.pattern, flags: 'i', categoryId: currentCategoryId, enabled: true, createdAt: Date.now() });
            setRuleModalVisible(false);
            message.success('已添加规则');
          }}
        >
          <Form.Item name="pattern" label="正则表达式" rules={[{ required: true, message: '请输入规则' }]}>
            <Input autoFocus placeholder="如：超市|便利店|Pak N Save" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );

  // openAddRule 已重构为受控弹窗（ruleModalVisible + ruleForm）

  async function removeCategory(id: number) {
    await db.transaction('rw', db.categories, db.rules, async () => {
      await db.rules.where('categoryId').equals(id).delete();
      await db.categories.delete(id);
    });
  }

  // 导入/导出的入口已移动到设置面板

  async function importData(json: any) {
    if (!json || !Array.isArray(json.categories) || !Array.isArray(json.rules)) {
      throw new Error('bad json');
    }
    await db.transaction('rw', db.categories, db.rules, async () => {
      // 合并：按名称 upsert 分类
      const existing = await db.categories.toArray();
      const nameToId = new Map(existing.filter((c) => typeof c.id === 'number').map((c) => [c.name, c.id!]));
      for (const c of json.categories as Array<Partial<Category>>) {
        if (!c?.name || !c.type) continue;
        const id = nameToId.get(c.name);
        if (id) {
          await db.categories.update(id, { type: c.type, color: c.color });
        } else {
          const newId = await db.categories.add({ name: c.name, type: c.type as any, color: c.color, createdAt: Date.now() });
          nameToId.set(c.name, newId);
        }
      }
      // 规则合并：按 pattern + 分类名
      for (const r of json.rules as Array<any>) {
        if (!r?.pattern || !r?.categoryName) continue;
        const categoryId = nameToId.get(r.categoryName);
        if (!categoryId) continue;
        const exists = await db.rules.where({ categoryId }).filter((x) => x.pattern === r.pattern).first();
        if (exists?.id) {
          await db.rules.update(exists.id, { flags: r.flags ?? 'i', enabled: r.enabled ?? true });
        } else {
          await db.rules.add({ pattern: r.pattern, flags: r.flags ?? 'i', categoryId, enabled: r.enabled ?? true, createdAt: Date.now() });
        }
      }
    });
  }
}

function RulesTable({ rules, categoriesMap }: { rules: CategoryRule[]; categoriesMap: Map<number, Category> }) {
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRule | null>(null);
  const [editForm] = Form.useForm<{ pattern: string; flags?: string; categoryId: number; enabled: boolean }>();

  return (
    <Card title="规则列表" bordered={false} style={{ marginTop: 16 }}>
      <Table
        size="small"
        rowKey={(r) => String(r.id)}
        dataSource={rules}
        pagination={{ pageSize: 8 }}
        columns={[
          {
            title: '规则',
            dataIndex: 'pattern',
            render: (v: string, r) => (
              <Space>
                <Typography.Text code>{`/${v}/${r.flags ?? ''}`}</Typography.Text>
              </Space>
            ),
          },
          {
            title: '分类',
            render: (_: any, r) => categoriesMap.get(r.categoryId)?.name ?? '-',
          },
          {
            title: '状态',
            dataIndex: 'enabled',
            render: (v: boolean) => (v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>),
          },
          {
            title: '操作',
            render: (_: any, r) => (
              <Space>
                <Button size="small" onClick={() => openEdit(r)}>编辑</Button>
                <Button size="small" onClick={async () => toggleRule(r)}>{r.enabled ? '停用' : '启用'}</Button>
                <Button size="small" danger onClick={async () => deleteRule(r.id!)}>删除</Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="编辑规则"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => editForm.submit()}
        destroyOnClose
      >
        <Form<{ pattern: string; flags?: string; categoryId: number; enabled: boolean }>
          form={editForm}
          layout="vertical"
          onFinish={async (values) => {
            if (!editing?.id) return;
            await db.rules.update(editing.id, {
              pattern: values.pattern,
              flags: values.flags ?? 'i',
              categoryId: values.categoryId,
              enabled: values.enabled,
            });
            setEditOpen(false);
            message.success('已更新规则');
          }}
        >
          <Form.Item name="pattern" label="正则表达式" rules={[{ required: true, message: '请输入规则' }]}>
            <Input autoFocus placeholder="如：超市|便利店|Pak N Save" />
          </Form.Item>
          <Form.Item name="flags" label="修饰符">
            <Input placeholder="如：i（忽略大小写）" />
          </Form.Item>
          <Form.Item name="categoryId" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
            <Select
              options={Array.from(categoriesMap, ([id, c]) => ({ label: c.name, value: id }))}
              placeholder="选择分类"
            />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );

  async function toggleRule(r: CategoryRule) {
    await db.rules.update(r.id!, { enabled: !r.enabled });
  }

  async function deleteRule(id: number) {
    await db.rules.delete(id);
  }

  function openEdit(r: CategoryRule) {
    setEditing(r);
    editForm.setFieldsValue({
      pattern: r.pattern,
      flags: r.flags ?? 'i',
      categoryId: r.categoryId,
      enabled: r.enabled,
    });
    setEditOpen(true);
  }
}


