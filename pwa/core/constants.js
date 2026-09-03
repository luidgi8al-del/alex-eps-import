export const DB_NAME = "eps-lvh-offline";
export const DB_VERSION = 1;
export const STORES = Object.freeze({ RECORDS: "records", OUTBOX: "outbox", CONFLICTS: "conflicts", META: "meta" });
export const SYNC_STATE = Object.freeze({ ONLINE: "online", OFFLINE: "offline", SYNCING: "syncing", PENDING: "pending", CONFLICT: "conflict", SYNCED: "synced", ERROR: "error" });
export const DEFAULT_BATCH_SIZE = 40;
/**
 * Lignes lues par table et par aller-retour.
 *
 * Plus large que le lot d'envoi : une table partagee par tout un etablissement porte des
 * centaines de creneaux, et les descendre quarante par quarante multipliait les allers-retours
 * sans rien apporter. L'envoi, lui, reste par petits lots - une operation refusee ne doit pas
 * entrainer les autres.
 */
export const PAGE_LECTURE = 500;
export const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
export const SYNC_EVENT = "eps:pwa-sync-state";
export function recordKey(entity, id) {
  if (!entity || id === undefined || id === null || id === "") throw new TypeError("Une entite et un identifiant sont obligatoires");
  return `${String(entity)}:${String(id)}`;
}
