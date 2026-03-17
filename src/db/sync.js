import { db } from './index';

export async function enqueuePendingOp({ table, method, endpoint, payload, localName }) {
  await db.pending_ops.add({
    table, method, endpoint, payload,
    local_name: localName,
    created_at: new Date().toISOString(),
    synced_at: null,
  });
}

export async function syncPendingOps() {
  return 0;
}

export async function getPendingCount() {
  return db.pending_ops.filter(op => !op.synced_at).count();
}
