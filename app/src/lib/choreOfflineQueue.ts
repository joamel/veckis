// Module-level queue som överlever navigering inom sessionen men inte app-omstart.
// Speglar shoppingOfflineQueue.ts men för sysslo-mutationer.
type ChoreOp = {
  type: 'complete' | 'uncomplete';
  choreId: string;
  date: string | null;
  performedByMemberId?: string | null;
  note?: string | null;
};

// key: `${choreId}:${date ?? 'null'}` — senaste op per förekomst vinner.
const queue = new Map<string, ChoreOp>();

export function enqueueChoreOp(op: ChoreOp): void {
  queue.set(`${op.choreId}:${op.date ?? 'null'}`, op);
}

export function getPendingChoreOps(): readonly ChoreOp[] {
  return [...queue.values()];
}

export function clearChoreOp(choreId: string, date: string | null): void {
  queue.delete(`${choreId}:${date ?? 'null'}`);
}
