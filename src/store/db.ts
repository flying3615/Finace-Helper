import Dexie, { type Table } from 'dexie';
import type { Category, CategoryRule } from '../types';

export class FinanceDB extends Dexie {
  categories!: Table<Category, number>;
  rules!: Table<CategoryRule, number>;

  constructor() {
    super('finance-helper');
    this.version(1).stores({
      categories: '++id, name, type, createdAt',
      rules: '++id, categoryId, enabled, createdAt',
    });
  }
}

export const db = new FinanceDB();
// 广播变更供 UI 监听（若 Dexie 支持 changes 事件则无需额外处理）


