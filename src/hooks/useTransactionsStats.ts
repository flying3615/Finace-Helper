import { useMemo } from 'react';
import dayjs from 'dayjs';
import type { Transaction } from '../types';

export type ViewType = '全部' | '支出' | '收入';

export interface Totals {
  income: number;
  expense: number;
  net: number;
}

export interface MonthlyAgg { month: string; income: number; expense: number; net: number }

export default function useTransactionsStats(transactions: Transaction[], view: ViewType, monthFilter: dayjs.Dayjs | null) {
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

  const totals: Totals = useMemo(() => {
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

  const monthly = useMemo<MonthlyAgg[]>(() => {
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

  return { baseByMonth, filtered, totals, byCategory, byAccount, topMerchants, monthly } as const;
}


