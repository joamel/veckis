// Pure functions for soft-merge tree manipulation.
// Items are referenced by id; mergedIntoId points to a parent container.
// A container is any item that has at least one descendant.
// A leaf (original) is any item with no descendants.

export interface MergeNode {
  id: string;
  mergedIntoId: string | null;
}

export interface UnmergeResult {
  /** Leaf items whose mergedIntoId should be set to null (they become visible again) */
  restoreLeaves: string[];
  /** Container items that should be deleted (root + any nested synthetic containers) */
  deleteContainers: string[];
}

/**
 * Given a flat list of items and a root container id, compute which items should be
 * restored as leaves vs deleted as synthetic containers.
 *
 * - The root is always counted as a container to delete.
 * - Any descendant with at least one child of its own is treated as a synthetic container.
 * - Any descendant with no children is treated as an original leaf to restore.
 */
export function planFullUnmerge(items: MergeNode[], rootId: string): UnmergeResult {
  const childrenByParent = new Map<string, string[]>();
  for (const it of items) {
    if (it.mergedIntoId) {
      if (!childrenByParent.has(it.mergedIntoId)) childrenByParent.set(it.mergedIntoId, []);
      childrenByParent.get(it.mergedIntoId)!.push(it.id);
    }
  }

  const deleteContainers: string[] = [];
  const restoreLeaves: string[] = [];
  const queue = [rootId];
  const visited = new Set<string>();

  while (queue.length) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);

    const kids = childrenByParent.get(cur) ?? [];
    if (kids.length === 0) {
      // No children → leaf. The originally-passed root is always considered a container though.
      if (cur === rootId) deleteContainers.push(cur);
      else restoreLeaves.push(cur);
    } else {
      deleteContainers.push(cur);
      queue.push(...kids);
    }
  }

  return { restoreLeaves, deleteContainers };
}

/**
 * Walk up the mergedIntoId chain from a given item id to find the top-level root.
 */
export function findRoot(items: MergeNode[], itemId: string): string {
  const byId = new Map(items.map(i => [i.id, i] as const));
  let cur = itemId;
  const seen = new Set<string>();
  while (true) {
    if (seen.has(cur)) return cur; // safety against cycles
    seen.add(cur);
    const item = byId.get(cur);
    if (!item || !item.mergedIntoId) return cur;
    cur = item.mergedIntoId;
  }
}
