export const DB_NAME = "eps-lvh-offline";
export const DB_VERSION = 1;
export const STORES = Object.freeze({ RECORDS: "records", OUTBOX: "outbox", CONFLICTS: "conflicts", META: "meta" });
export const SYNC_STATE = Object.freeze({ ONLINE: "online", OFFLINE: "offline", SYNCING: "syncing", PENDING: "pending", CONFLICT: "conflict", SYNCED: "synced", ERROR: "error" });
export const DEFAULT_BATCH_SIZE = 40;
export const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
export const SYNC_EVENT = "eps:pwa-sync-state";
export function recordKey(entity, id) {
  if (!entity || id === undefined || id === null || id === "") throw new TypeError("Une entite et un identifiant sont obligatoires");
  return `${String(entity)}:${String(id)}`;
}
