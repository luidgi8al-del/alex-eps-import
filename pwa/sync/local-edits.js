import { readLocalRecord, prepareLocalRecord } from "../storage/records.js";
import { prepareOperation } from "./outbox.js";
import { transaction, generationLocale } from "../storage/database.js";
import { STORES } from "../core/constants.js";
import { changedFieldsBetween } from "./merge.js";
function requireSameAccount(generation) {
  if (generationLocale() !== generation) throw Error("Le compte a changé pendant l’enregistrement. Revenez sur le compte de la saisie puis réessayez.");
}
// A saved row and its pending upload are one indivisible write. If the device cannot
// store either, neither is committed; retrying the same edit must never become a no-op.
async function commitLocalEdit(record, operation, generation) {
  await transaction([STORES.RECORDS, STORES.OUTBOX], "readwrite", stores => {
    requireSameAccount(generation);
    stores[STORES.RECORDS].put(record);
    stores[STORES.OUTBOX].put(operation);
  }, "strict");
  return { changed: true, record, operation };
}
export async function saveOfflineEdit({ entity, id, data, authorId, deviceId, originalData }) {
  const generation = generationLocale();
  const current = await readLocalRecord(entity, id);
  requireSameAccount(generation);
  // L'identité d'une note ne change pas quand on corrige ses points. Une ancienne interface
  // pouvait fournir seulement {id, points, deleted}, puis la synchronisation interprétait
  // les clés absentes comme des suppressions et envoyait une ligne refusée par la sécurité.
  if (entity === "evaluation_scores") {
    data = { ...current?.data, ...originalData, ...data };
    for (const field of ["user_id", "criterion_id", "student_id"]) {
      if (!data[field]) throw new Error(`Note non synchronisée : ${field} manquant. Rouvrez l'évaluation avant de réessayer.`);
    }
  }
  // Le formulaire peut avoir été ouvert avant le téléchargement local, ou être resté
  // ouvert pendant une synchronisation. Sa référence est la fiche réellement affichée,
  // jamais une copie vide ni une fiche reçue après le début de la saisie.
  const baseData = originalData ?? current?.data ?? {};
  const baseVersion = originalData?.version ?? current?.version ?? 0;
  const changedFields = changedFieldsBetween(baseData, data);
  requireSameAccount(generation);
  if (!changedFields.length) return { changed: false, record: current };
  const record = await prepareLocalRecord({ entity, id, data, version: baseVersion, updatedAt: new Date().toISOString(), deleted: false });
  const operation = await prepareOperation({ entity, id, action: "upsert", baseVersion, baseData, data, changedFields, authorId, deviceId });
  return commitLocalEdit(record, operation, generation);
}
export async function saveOfflineDeletion({ entity, id, authorId, deviceId }) {
  const generation = generationLocale();
  const current = await readLocalRecord(entity, id);
  requireSameAccount(generation);
  if (!current) return { changed: false };
  const record = await prepareLocalRecord({ ...current, data: current.data, deleted: true, updatedAt: new Date().toISOString() });
  const operation = await prepareOperation({ entity, id, action: "delete", baseVersion: current.version, baseData: current.data, data: null, changedFields: ["__deleted__"], authorId, deviceId });
  return commitLocalEdit(record, operation, generation);
}
