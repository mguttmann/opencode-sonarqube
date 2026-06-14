/**
 * Group items by a key function
 */
export function groupBy<T, K extends string>(
  items: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  const groups: Partial<Record<K, T[]>> = {};

  for (const item of items) {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key]!.push(item);
  }

  return groups as Record<K, T[]>;
}
