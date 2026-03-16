/**
 * Offline write queue.
 *
 * When the app is offline and a write is attempted we:
 *   1. Write an optimistic record to the local DB (so the UI reflects it immediately)
 *   2. Push a pending_op entry with the full API payload
 *
 * When the device comes back online, `syncPendingOps()` replays every queued
 * operation against the ERPNext API and updates the local record with the
 * server-returned data.
 */
import { db } from './index';
import client from '../api/client';

export async function enqueuePendingOp({ table, method, endpoint, payload, localName }) {
  await db.pending_ops.add({
    table,
    method,
    endpoint,
    payload,
    local_name: localName,
    created_at: new Date().toISOString(),
    synced_at: null,
  });
}

export async function syncPendingOps() {
  const ops = await db.pending_ops.filter(op => !op.synced_at).toArray();
  if (ops.length === 0) return 0;

  let synced = 0;
  for (const op of ops) {
    try {
      let res;
      if (op.method === 'POST') {
        res = await client.post(op.endpoint, op.payload);
      } else if (op.method === 'PUT') {
        res = await client.put(op.endpoint, op.payload);
      } else {
        continue;
      }

      const serverRecord = res.data?.data || res.data;

      // Replace the optimistic local record with the real server record
      if (serverRecord?.name && op.local_name) {
        await db[op.table].delete(op.local_name);
        await db[op.table].put({ ...serverRecord, _pending: false });
      }

      await db.pending_ops.update(op.id, { synced_at: new Date().toISOString() });
      synced++;
    } catch {
      // Leave in queue — will retry next time we come online
    }
  }
  return synced;
}

export async function getPendingCount() {
  return db.pending_ops.filter(op => !op.synced_at).count();
}
