import { recordKey, STORES } from "../core/constants.js";
import { openOfflineDatabase, requestResult, transaction, marquerEffacement } from "./database.js";
import { seal, unseal } from "./vault.js";
export async function saveLocalRecord({ entity, id, data, version = 0, updatedAt, deleted = false }) {
  const key = recordKey(entity, id);
  const row = { key, entity, id: String(id), envelope: await seal(data, key), version, updatedAt: updatedAt || new Date().toISOString(), deleted };
  await transaction([STORES.RECORDS], "readwrite", stores => stores[STORES.RECORDS].put(row)); return row;
}
export async function readLocalRecord(entity, id) {
  const key = recordKey(entity, id);
  const row = await transaction([STORES.RECORDS], "readonly",
    stores => requestResult(stores[STORES.RECORDS].get(key)));
  return row ? { ...row, data: await unseal(row.envelope, key) } : null;
}
export async function listLocalRecords(entity, { includeDeleted = false } = {}) {
  const rows = await transaction([STORES.RECORDS], "readonly",
    stores => requestResult(stores[STORES.RECORDS].index("byEntity").getAll(entity)));
  return Promise.all((includeDeleted ? rows : rows.filter(row => !row.deleted)).map(async row => ({ ...row, data: await unseal(row.envelope, row.key) })));
}
/** Nombre de fiches en local, toutes tables confondues. Voir generationLocale. */
export async function countLocalRecords() {
  return transaction([STORES.RECORDS], "readonly",
    stores => requestResult(stores[STORES.RECORDS].count()));
}

/**
 * Numero de generation de la copie locale, incremente a chaque effacement ou bascule de compte.
 *
 * Il sert a une chose : une synchronisation commencee avant ne doit pas enregistrer son curseur
 * apres. Sinon le curseur affirme que tout a ete lu alors que la copie est vide, et plus rien
 * n'est jamais redescendu. Il vit dans database.js, qui sait aussi quand la base change.
 */
export { generationLocale, utiliserCompte, supprimerToutesLesBases } from "./database.js";

export async function removeAllLocalData() {
  marquerEffacement();
  return transaction(Object.values(STORES), "readwrite", stores => Object.values(STORES).forEach(name => stores[name].clear()));
}
