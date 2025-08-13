import { db } from '../store/db';
import type { Transaction } from '../types';

export async function normalizeMerchantsAsync(transactions: Transaction[]): Promise<Transaction[]> {
  const aliases = await db.merchantAliases.filter((a) => a.enabled).toArray();
  const runtime: Array<{ re: RegExp; name: string }> = [];
  for (const a of aliases) {
    try {
      runtime.push({ re: new RegExp(a.pattern, a.flags ?? 'i'), name: a.canonicalName });
    } catch {}
  }
  return transactions.map((t) => {
    const text = `${t.merchant ?? ''} ${t.note ?? ''}`;
    const hit = runtime.find((r) => r.re.test(text));
    return hit ? { ...t, merchantNorm: hit.name } : t;
  });
}


