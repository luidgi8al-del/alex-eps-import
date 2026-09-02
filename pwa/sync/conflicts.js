import { STORES } from "../core/constants.js";
import { openOfflineDatabase, requestResult, transaction } from "../storage/database.js";
import { seal, unseal } from "../storage/vault.js";
export async function storeConflict({ operation, serverRecord, overlappingFields }) {
  const conflictId = `${operation.recordKey}:${operation.opId}`;
  const row = { conflictId, recordKey: operation.recordKey, entity: operation.entity, id: operation.id, operationId: operation.opId, baseVersion: operation.baseVersion, serverVersion: serverRecord.version, overlappingFields, localAuthorId: operation.authorId, serverAuthorId: serverRecord.authorId || null, localModifiedAt: operation.createdAt, serverModifiedAt: serverRecord.updatedAt, detectedAt: new Date().toISOString(), envelope: await seal({ baseData: operation.baseData, localData: operation.data, serverData: serverRecord.data }, conflictId) };
  await transaction([STORES.CONFLICTS], "readwrite", stores => stores[STORES.CONFLICTS].put(row)); return row;
}
export async function listConflicts() {
  const db = await openOfflineDatabase();
  const rows = await requestResult(db.transaction(STORES.CONFLICTS, "readonly").objectStore(STORES.CONFLICTS).index("byDetectedAt").getAll());
  return Promise.all(rows.map(async row => ({ ...row, ...(await unseal(row.envelope, row.conflictId)) })));
}
export async function removeConflict(conflictId) { return transaction([STORES.CONFLICTS], "readwrite", stores => stores[STORES.CONFLICTS].delete(conflictId)); }
export async function countConflicts() { const db = await openOfflineDatabase(); return requestResult(db.transaction(STORES.CONFLICTS, "readonly").objectStore(STORES.CONFLICTS).count()); }
