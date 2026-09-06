import { DEFAULT_BATCH_SIZE, MAX_RETRY_DELAY_MS, recordKey, STORES } from "../core/constants.js";
import { openOfflineDatabase, requestResult, transaction } from "../storage/database.js";
import { seal, unseal } from "../storage/vault.js";
import { estPanneReseau } from "../core/connectivity.js";
function operationId() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
export async function enqueueOperation({ entity, id, action = "upsert", baseVersion = 0, baseData = null, data = null, changedFields = [], authorId = null, deviceId = null }) {
  const key = recordKey(entity, id), opId = operationId(), createdAt = new Date().toISOString();
  const row = { opId, recordKey: key, entity, id: String(id), action, baseVersion, changedFields: [...new Set(changedFields)].sort(), authorId, deviceId, envelope: await seal({ baseData, data }, `${key}:${opId}`), createdAt, retryAt: createdAt, attempts: 0 };
  await transaction([STORES.OUTBOX], "readwrite", stores => stores[STORES.OUTBOX].put(row)); return row;
}
export async function pendingOperations(limit = DEFAULT_BATCH_SIZE) {
  const rows = await transaction([STORES.OUTBOX], "readonly",
    stores => requestResult(stores[STORES.OUTBOX].index("byCreatedAt").getAll()));
  const ready = rows.filter(row => Date.parse(row.retryAt) <= Date.now()).slice(0, limit);
  return Promise.all(ready.map(async row => ({ ...row, ...(await unseal(row.envelope, `${row.recordKey}:${row.opId}`)) })));
}
export async function operationsForRecord(key) {
  const rows = await transaction([STORES.OUTBOX], "readonly",
    stores => requestResult(stores[STORES.OUTBOX].index("byRecord").getAll(key)));
  return Promise.all(rows.map(async row => ({ ...row, ...(await unseal(row.envelope, `${row.recordKey}:${row.opId}`)) })));
}
export async function countPendingOperations() {
  return transaction([STORES.OUTBOX], "readonly", stores => requestResult(stores[STORES.OUTBOX].count()));
}
export async function acknowledgeOperation(opId) { return transaction([STORES.OUTBOX], "readwrite", stores => stores[STORES.OUTBOX].delete(opId)); }
export async function deferOperation(operation, error) {
  const attempts = operation.attempts + 1;
  // L'espacement croissant protege un serveur en difficulte. Une coupure reseau ne lui doit rien :
  // sans cette distinction, revenir sur le wifi apres quelques essais laissait la saisie attendre
  // cinq minutes de plus, sans raison.
  const delay = estPanneReseau(error)
    ? 5000
    : Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** Math.min(attempts, 8));
  const row = { ...operation, attempts, retryAt: new Date(Date.now() + delay).toISOString(), lastError: String(error?.message || error) };
  delete row.baseData; delete row.data;
  return transaction([STORES.OUTBOX], "readwrite", stores => stores[STORES.OUTBOX].put(row));
}
export async function replaceOperation(operation, { baseVersion, baseData, data, changedFields }) {
  const row = { ...operation, baseVersion, changedFields, envelope: await seal({ baseData, data }, `${operation.recordKey}:${operation.opId}`), retryAt: new Date().toISOString() };
  delete row.baseData; delete row.data;
  return transaction([STORES.OUTBOX], "readwrite", stores => stores[STORES.OUTBOX].put(row));
}
