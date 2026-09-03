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
/** Nombre de fiches en local, toutes tables confondues. Voir generationLocale. */
export async function countLocalRecords() {
  const db = await openOfflineDatabase();
  return requestResult(db.transaction(STORES.RECORDS, "readonly").objectStore(STORES.RECORDS).count());
}

/**
 * Numero de generation de la copie locale, incremente a chaque effacement.
 *
 * Il sert a une chose : une synchronisation commencee avant un effacement ne doit pas enregistrer
 * son curseur apres. Sinon le curseur affirme que tout a ete lu alors que la copie est vide, et
 * plus rien n'est jamais redescendu. C'est ce qui arrivait au changement de compte.
 */
let generation = 0;
export function generationLocale() { return generation; }

export async function removeAllLocalData() {
  generation += 1;
  return transaction(Object.values(STORES), "readwrite", stores => Object.values(STORES).forEach(name => stores[name].clear()));
}
