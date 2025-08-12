import type { Transaction } from '../types';
import { db } from '../store/db';

type CategorizeRule = { keyword: RegExp; category: string };

const rules: CategorizeRule[] = [
  { keyword: /超市|便利店|沃尔玛|盒马|物美/i, category: '日常' },
  { keyword: /美团|饿了么|外卖/i, category: '餐饮' },
  { keyword: /地铁|打车|滴滴|高德|公交/i, category: '出行' },
  { keyword: /京东|淘宝|天猫|拼多多/i, category: '网购' },
  { keyword: /医院|药房|药店/i, category: '医疗' },
  { keyword: /房贷|房租|物业/i, category: '居住' },
  { keyword: /会员|腾讯视频|爱奇艺|网易云|Spotify|Netflix/i, category: '订阅' },
];

export async function applyRulesAsync(transactions: Transaction[]): Promise<Transaction[]> {
  const dynamicRules = await db.rules.filter((r) => r.enabled).toArray();
  const categories = await db.categories.toArray();
  const categoryIdToName = new Map<number, string>();
  const categoryNameToColor = new Map<string, string | undefined>();
  for (const c of categories) {
    if (typeof c.id === 'number') categoryIdToName.set(c.id, c.name);
    categoryNameToColor.set(c.name, typeof c.color === 'string' ? c.color : undefined);
  }
  const runtimeRules: { regex: RegExp; categoryId: number }[] = [];
  for (const r of dynamicRules) {
    try {
      runtimeRules.push({ regex: new RegExp(r.pattern, r.flags ?? 'i'), categoryId: r.categoryId });
    } catch {}
  }

  const withFlow = transactions.map((tx) => {
    if (tx.category) return tx;
    const text = `${tx.merchant ?? ''} ${tx.note ?? ''}`;
    const staticRule = rules.find((r) => r.keyword.test(text));
    if (staticRule) return { ...tx, category: staticRule.category };

    const hit = runtimeRules.find((r) => r.regex.test(text));
    if (hit) return { ...tx, category: categoryIdToName.get(hit.categoryId) ?? '未分类' };
    return tx;
  });

  // 基于明细信息识别“转账/还款”等内转，不纳入收入/支出统计
  return withFlow.map((t) => {
    const text = `${t.merchant ?? ''} ${t.note ?? ''}`;
    const isTransferLike = /transfer|转账|internal/i.test(text);
    const isRepaymentLike = /(online\s+)?payment\s*-\s*thank\s*you|credit\s*card\s*payment|还款/i.test(text);
    if (isTransferLike || isRepaymentLike) {
      return { ...t, flow: '转账' } as Transaction;
    }
    return t.amount >= 0 ? { ...t, flow: '收入' } : { ...t, flow: '支出' };
  });
}


