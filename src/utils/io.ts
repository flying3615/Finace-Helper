import { db } from '../store/db';
import type { Category, MerchantAlias } from '../types';

export async function exportCategoriesAndRules(): Promise<Blob> {
  const [cats, rls] = await Promise.all([
    db.categories.orderBy('createdAt').toArray(),
    db.rules.orderBy('createdAt').toArray(),
  ]);
  const idToName = new Map<number, string>();
  cats.forEach((c) => {
    if (typeof c.id === 'number') idToName.set(c.id, c.name);
  });
  const payload = {
    version: 1,
    categories: cats.map(({ id, ...rest }) => rest),
    rules: rls.map(({ id, categoryId, ...rest }) => ({ ...rest, categoryName: idToName.get(categoryId) })),
    exportedAt: Date.now(),
  } as const;
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
}

export async function importCategoriesAndRules(json: any): Promise<void> {
  if (!json || !Array.isArray(json.categories) || !Array.isArray(json.rules)) {
    throw new Error('bad json');
  }
  await db.transaction('rw', db.categories, db.rules, async () => {
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

export async function exportMerchantAliases(): Promise<Blob> {
  const list = await db.merchantAliases.orderBy('createdAt').toArray();
  const payload = { version: 1, aliases: list.map(({ id, ...rest }) => rest), exportedAt: Date.now() } as const;
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
}

export async function importMerchantAliases(json: any): Promise<void> {
  if (!json || !Array.isArray(json.aliases)) throw new Error('bad json');
  await db.transaction('rw', db.merchantAliases, async () => {
    for (const a of json.aliases as Array<Partial<MerchantAlias>>) {
      if (!a?.pattern || !a?.canonicalName) continue;
      const exists = await db.merchantAliases
        .where('canonicalName')
        .equals(a.canonicalName!)
        .filter((x) => x.pattern === a.pattern && (x.flags ?? 'i') === (a.flags ?? 'i'))
        .first();
      if (exists?.id) {
        await db.merchantAliases.update(exists.id, { enabled: a.enabled ?? true });
      } else {
        await db.merchantAliases.add({
          pattern: a.pattern!,
          flags: a.flags ?? 'i',
          canonicalName: a.canonicalName!,
          enabled: a.enabled ?? true,
          createdAt: Date.now(),
        });
      }
    }
  });
}


