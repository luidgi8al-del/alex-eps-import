import { readLocalRecord, saveLocalRecord } from "../storage/records.js";
import { enqueueOperation } from "./outbox.js";
import { changedFieldsBetween } from "./merge.js";
export async function saveOfflineEdit({ entity, id, data, authorId, deviceId, originalData }) {
  const current = await readLocalRecord(entity, id);
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
  if (!changedFields.length) return { changed: false, record: current };
  const record = await saveLocalRecord({ entity, id, data, version: baseVersion, updatedAt: new Date().toISOString(), deleted: false });
  const operation = await enqueueOperation({ entity, id, action: "upsert", baseVersion, baseData, data, changedFields, authorId, deviceId });
  return { changed: true, record, operation };
}
export async function saveOfflineDeletion({ entity, id, authorId, deviceId }) {
  const current = await readLocalRecord(entity, id); if (!current) return { changed: false };
  const record = await saveLocalRecord({ ...current, data: current.data, deleted: true, updatedAt: new Date().toISOString() });
  const operation = await enqueueOperation({ entity, id, action: "delete", baseVersion: current.version, baseData: current.data, data: null, changedFields: ["__deleted__"], authorId, deviceId });
  return { changed: true, record, operation };
}
