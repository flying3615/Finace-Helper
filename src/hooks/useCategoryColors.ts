import { useEffect, useState } from 'react';
import { db } from '../store/db';

export default function useCategoryColors() {
  const [categoryColors, setCategoryColors] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const cats = await db.categories.toArray();
      if (!mounted) return;
      const map: Record<string, string | undefined> = {};
      for (const c of cats) {
        if (c.name) map[c.name] = typeof c.color === 'string' ? c.color : undefined;
      }
      setCategoryColors((prev) => {
        const prevStr = JSON.stringify(prev);
        const nextStr = JSON.stringify(map);
        return prevStr === nextStr ? prev : map;
      });
    };
    load();
    const timer = setInterval(load, 2000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return categoryColors;
}


