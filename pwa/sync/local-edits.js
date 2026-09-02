import { readLocalRecord, saveLocalRecord } from "../storage/records.js";
import { enqueueOperation } from "./outbox.js";
import { changedFieldsBetween } from "./merge.js";
export async function saveOfflineEdit({ entity, id, data, authorId, deviceId }) {
  const current = await readLocalRecord(entity, id), baseData = current?.data || {};
  const changedFields = changedFieldsBetween(baseData, data);
  if (!changedFields.length) return { changed: false, record: current };
  const record = await saveLocalRecord({ entity, id, data, version: current?.version || 0, updatedAt: new Date().toISOString(), deleted: false });
  const operation = await enqueueOperation({ entity, id, action: "upsert", baseVersion: current?.version || 0, baseData, data, changedFields, authorId, deviceId });
  return { changed: true, record, operation };
}
export async function saveOfflineDeletion({ entity, id, authorId, deviceId }) {
  const current = await readLocalRecord(entity, id); if (!current) return { changed: false };
  const record = await saveLocalRecord({ ...current, data: current.data, deleted: true, updatedAt: new Date().toISOString() });
  const operation = await enqueueOperation({ entity, id, action: "delete", baseVersion: current.version, baseData: current.data, data: null, changedFields: ["__deleted__"], authorId, deviceId });
  return { changed: true, record, operation };
}
