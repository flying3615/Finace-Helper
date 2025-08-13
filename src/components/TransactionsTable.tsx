import { Table } from 'antd';
import type { Transaction } from '../types';
import './TransactionsTable.css';

export interface TransactionsTableProps {
  data: Transaction[];
}

export default function TransactionsTable({ data }: TransactionsTableProps) {
  return (
    <Table
      className="transactions-table"
      size="small"
      rowKey="id"
      dataSource={data}
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
  );
}


