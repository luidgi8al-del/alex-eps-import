import { STORES } from "../core/constants.js";
import { openOfflineDatabase, requestResult, transaction } from "../storage/database.js";
import { seal, unseal } from "../storage/vault.js";
export async function storeConflict({ operation, serverRecord, overlappingFields }) {
  const conflictId = `${operation.recordKey}:${operation.opId}`;
  const row = { conflictId, recordKey: operation.recordKey, entity: operation.entity, id: operation.id, operationId: operation.opId, baseVersion: operation.baseVersion, serverVersion: serverRecord.version, overlappingFields, localAuthorId: operation.authorId, serverAuthorId: serverRecord.authorId || null, localModifiedAt: operation.createdAt, serverModifiedAt: serverRecord.updatedAt, detectedAt: new Date().toISOString(), envelope: await seal({ baseData: operation.baseData, localData: operation.data, serverData: serverRecord.data }, conflictId) };
  await transaction([STORES.CONFLICTS], "readwrite", stores => stores[STORES.CONFLICTS].put(row)); return row;
}
/**
 * Enregistre un refus definitif : une saisie que le serveur n'acceptera jamais de ce compte.
 *
 * Elle est rangee avec les conflits parce qu'elle appelle la meme chose - une decision humaine -
 * mais elle n'offre aucun choix : la version du serveur est la seule possible. Ce qui compte est
 * qu'elle soit VUE. Une saisie refusee qui disparait en silence est exactement ce que le mode
 * hors connexion doit empecher.
 */
export async function storeRejection({ operation, serverRecord, reason }) {
  const conflictId = `${operation.recordKey}:${operation.opId}`;
  const row = {
    conflictId, kind: "refus", reason: reason || "droits insuffisants",
    recordKey: operation.recordKey, entity: operation.entity, id: operation.id,
    operationId: operation.opId, baseVersion: operation.baseVersion,
    serverVersion: serverRecord ? serverRecord.version : operation.baseVersion,
    overlappingFields: operation.changedFields || [],
    localAuthorId: operation.authorId, serverAuthorId: (serverRecord && serverRecord.authorId) || null,
    localModifiedAt: operation.createdAt,
    serverModifiedAt: (serverRecord && serverRecord.updatedAt) || null,
    detectedAt: new Date().toISOString(),
    envelope: await seal({ baseData: operation.baseData, localData: operation.data,
                           serverData: (serverRecord && serverRecord.data) || null }, conflictId)
  };
  await transaction([STORES.CONFLICTS], "readwrite", stores => stores[STORES.CONFLICTS].put(row));
  return row;
}

export async function listConflicts() {
  const rows = await transaction([STORES.CONFLICTS], "readonly",
    stores => requestResult(stores[STORES.CONFLICTS].index("byDetectedAt").getAll()));
  return Promise.all(rows.map(async row => ({ ...row, ...(await unseal(row.envelope, row.conflictId)) })));
}
export async function removeConflict(conflictId) { return transaction([STORES.CONFLICTS], "readwrite", stores => stores[STORES.CONFLICTS].delete(conflictId)); }
export async function countConflicts() {
  return transaction([STORES.CONFLICTS], "readonly", stores => requestResult(stores[STORES.CONFLICTS].count()));
}
