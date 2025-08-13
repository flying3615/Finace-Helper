import { useEffect } from 'react';
import type { Transaction } from '../types';
import { db } from '../store/db';

export default function usePersistedTransactions(
  transactions: Transaction[],
  setTransactions: (next: Transaction[]) => void,
) {
  // 初次加载：从 IndexedDB 读取
  useEffect(() => {
    let mounted = true;
    (async () => {
      const rows = await db.transactions?.orderBy('date').toArray();
      if (mounted && rows && rows.length > 0) {
        setTransactions(rows);
      }
    })();
    return () => { mounted = false; };
  }, [setTransactions]);

  // 持久化：数据变化时批量 upsert
  useEffect(() => {
    (async () => {
      if (!db.transactions) return;
      if (!transactions || transactions.length === 0) {
        // 若清空内存数据，则清空库表
        await db.transactions.clear();
        return;
      }
      await db.transaction('rw', db.transactions, async () => {
        await db.transactions.bulkPut(transactions);
      });
    })();
  }, [transactions]);
}


