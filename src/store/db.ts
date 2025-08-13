import Dexie, { type Table } from 'dexie';
import type { Category, CategoryRule, MerchantAlias, Transaction } from '../types';

export class FinanceDB extends Dexie {
  categories!: Table<Category, number>;
  rules!: Table<CategoryRule, number>;
  merchantAliases!: Table<MerchantAlias, number>;
  transactions!: Table<Transaction, string>;

  constructor() {
    super('finance-helper');
    this.version(1).stores({
      categories: '++id, name, type, createdAt',
      rules: '++id, categoryId, enabled, createdAt',
    });
    this.version(2).stores({
      merchantAliases: '++id, canonicalName, createdAt',
    });
    this.version(3).stores({
      // 使用字符串主键 id（CSV 导入时生成），并为常用字段建立索引
      transactions: '&id, date, account, merchant, merchantNorm, category',
    });
  }
}

export const db = new FinanceDB();
// 广播变更供 UI 监听（若 Dexie 支持 changes 事件则无需额外处理）


