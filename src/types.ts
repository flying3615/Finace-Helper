export type Currency = 'CNY' | 'USD' | string;

export interface Transaction {
  id: string;
  date: string; // ISO YYYY-MM-DD
  amount: number; // 负数=支出，正数=收入
  currency: Currency;
  merchant?: string;
  category?: string;
  note?: string;
  account?: string; // 账户/卡信息（如卡号、账户号或来源标签：信用卡/储蓄卡）
  raw?: Record<string, unknown>;
  flow?: '收入' | '支出' | '转账';
}

export type CategoryType = '支出' | '收入' | '全部';

export interface Category {
  id?: number;
  name: string;
  type: CategoryType;
  color?: string;
  createdAt: number;
}

export interface CategoryRule {
  id?: number;
  pattern: string; // 正则表达式文本
  flags?: string; // 如 'i'
  categoryId: number; // 指向 Category
  enabled: boolean;
  createdAt: number;
}


