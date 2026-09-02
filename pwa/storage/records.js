import { recordKey, STORES } from "../core/constants.js";
import { openOfflineDatabase, requestResult, transaction } from "./database.js";
import { seal, unseal } from "./vault.js";
export async function saveLocalRecord({ entity, id, data, version = 0, updatedAt, deleted = false }) {
  const key = recordKey(entity, id);
  const row = { key, entity, id: String(id), envelope: await seal(data, key), version, updatedAt: updatedAt || new Date().toISOString(), deleted };
  await transaction([STORES.RECORDS], "readwrite", stores => stores[STORES.RECORDS].put(row)); return row;
}
export async function readLocalRecord(entity, id) {
  const key = recordKey(entity, id); const db = await openOfflineDatabase();
  const row = await requestResult(db.transaction(STORES.RECORDS, "readonly").objectStore(STORES.RECORDS).get(key));
  return row ? { ...row, data: await unseal(row.envelope, key) } : null;
}
export async function listLocalRecords(entity, { includeDeleted = false } = {}) {
  const db = await openOfflineDatabase();
  const rows = await requestResult(db.transaction(STORES.RECORDS, "readonly").objectStore(STORES.RECORDS).index("byEntity").getAll(entity));
  return Promise.all((includeDeleted ? rows : rows.filter(row => !row.deleted)).map(async row => ({ ...row, data: await unseal(row.envelope, row.key) })));
}
export async function removeAllLocalData() {
  return transaction(Object.values(STORES), "readwrite", stores => Object.values(STORES).forEach(name => stores[name].clear()));
}
