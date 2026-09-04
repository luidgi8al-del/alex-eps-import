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
/**
 * Nombre de tentatives avant d'abandonner l'envoi d'une saisie.
 *
 * Sans plafond, un refus que l'adaptateur ne sait pas nommer revient indefiniment dans la file.
 * C'est ce qui est arrive le 04/09/2026 : un desaccord de version rendu en HTTP 500 au lieu de
 * 409, donc pris pour une panne passagere, et repris cinquante-huit mille fois en une heure.
 */
export const MAX_TENTATIVES_ENVOI = 6;
export const SYNC_EVENT = "eps:pwa-sync-state";
export function recordKey(entity, id) {
  if (!entity || id === undefined || id === null || id === "") throw new TypeError("Une entite et un identifiant sont obligatoires");
  return `${String(entity)}:${String(id)}`;
}
