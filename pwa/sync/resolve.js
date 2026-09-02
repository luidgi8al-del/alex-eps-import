import { SYNC_STATE } from "../core/constants.js";
import { publishSyncState } from "../core/events.js";
import { saveLocalRecord } from "../storage/records.js";
import { enqueueOperation, countPendingOperations } from "./outbox.js";
import { countConflicts, listConflicts, removeConflict } from "./conflicts.js";
import { changedFieldsBetween, chooseConflictVersion } from "./merge.js";

/**
 * Applique la decision prise sur un conflit et remet la version choisie en route.
 *
 * Sans ce module, un conflit etait un cul-de-sac : le moteur retirait l'operation de la file, si
 * bien que la saisie hors ligne n'etait jamais renvoyee. Elle survivait dans la fiche de conflit,
 * mais rien ne pouvait l'en sortir - une modification faite dans le gymnase disparaissait sans que
 * personne ne s'en apercoive.
 *
 * La nouvelle operation part de la version du serveur : c'est ce qui empeche le meme conflit de se
 * redeclencher indefiniment au prochain envoi.
 */
export async function resolveConflict(conflictId, choice, customData) {
  const conflit = (await listConflicts()).find(item => item.conflictId === conflictId);
  if (!conflit) throw new Error("Conflit introuvable : il a peut-etre deja ete resolu.");

  const retenue = chooseConflictVersion(conflit, choice, customData);

  // Garder la version du serveur ne demande aucun envoi : elle y est deja.
  if (choice === "server") {
    await saveLocalRecord({
      entity: conflit.entity, id: conflit.id, data: conflit.serverData,
      version: conflit.serverVersion, updatedAt: conflit.serverModifiedAt, deleted: false
    });
    await removeConflict(conflictId);
    return publierEtat({ resolu: conflictId, envoye: false });
  }

  const champsModifies = changedFieldsBetween(conflit.serverData, retenue);
  await saveLocalRecord({
    entity: conflit.entity, id: conflit.id, data: retenue,
    version: conflit.serverVersion, updatedAt: new Date().toISOString(), deleted: false
  });
  // Rien ne differe de ce que le serveur porte deja : inutile de lui renvoyer la meme chose.
  if (champsModifies.length === 0) {
    await removeConflict(conflictId);
    return publierEtat({ resolu: conflictId, envoye: false });
  }

  await enqueueOperation({
    entity: conflit.entity, id: conflit.id, action: "upsert",
    baseVersion: conflit.serverVersion, baseData: conflit.serverData, data: retenue,
    changedFields: champsModifies, authorId: conflit.localAuthorId
  });
  await removeConflict(conflictId);
  return publierEtat({ resolu: conflictId, envoye: true });
}

/**
 * Resolution champ par champ : pour chaque champ en desaccord, "local" ou "server".
 * Les champs hors conflit gardent la valeur du serveur, deja fusionnee par le moteur.
 */
export function buildFieldChoice(conflit, choixParChamp = {}) {
  const resultat = { ...conflit.serverData };
  conflit.overlappingFields.forEach(champ => {
    if (choixParChamp[champ] !== "local") return;
    if (Object.prototype.hasOwnProperty.call(conflit.localData, champ)) resultat[champ] = conflit.localData[champ];
    else delete resultat[champ];
  });
  return resultat;
}

/** Abandonne un conflit sans rien renvoyer : la version du serveur fait foi. */
export async function discardConflict(conflictId) {
  return resolveConflict(conflictId, "server");
}

async function publierEtat(detail) {
  const conflicts = await countConflicts();
  const pending = await countPendingOperations();
  const etat = conflicts ? SYNC_STATE.CONFLICT : pending ? SYNC_STATE.PENDING : SYNC_STATE.SYNCED;
  return publishSyncState(etat, { conflicts, pending, ...detail });
}
