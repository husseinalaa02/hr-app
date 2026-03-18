import { db } from './index';

export async function syncPendingOps() {
  return 0;
}

export async function getPendingCount() {
  return db.pending_ops.filter(op => !op.synced_at).count();
}
