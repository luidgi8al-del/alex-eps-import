import { DEFAULT_BATCH_SIZE, SYNC_STATE } from "../core/constants.js";
import { publishSyncState } from "../core/events.js";
import { estPanneReseau } from "../core/connectivity.js";
import { getMeta, setMeta } from "../storage/database.js";
import { saveLocalRecord } from "../storage/records.js";
import { acknowledgeOperation, countPendingOperations, deferOperation, operationsForRecord, pendingOperations, replaceOperation } from "./outbox.js";
import { countConflicts, storeConflict, storeRejection } from "./conflicts.js";
import { mergeOfflineChange } from "./merge.js";
const CURSOR_KEY = "last-server-cursor";
/** Les tables que le curseur couvre. Voir #pullAndReconcile. */
const TABLES_KEY = "cursor-tables";
export class OfflineSyncEngine {
  #adapter; #batchSize; #running;
  constructor({ adapter, batchSize = DEFAULT_BATCH_SIZE }) {
    if (!adapter?.pullChanges || !adapter?.pushOperation) throw new TypeError("Adaptateur de synchronisation incomplet");
    this.#adapter = adapter; this.#batchSize = batchSize;
  }
  async sync() {
    if (this.#running) return this.#running;
    if (!navigator.onLine) return publishSyncState(SYNC_STATE.OFFLINE, { pending: await countPendingOperations() });
    this.#running = this.#run().finally(() => { this.#running = null; }); return this.#running;
  }
  async #run() {
    publishSyncState(SYNC_STATE.SYNCING);
    try {
      await this.#pullAndReconcile(); await this.#pushPending(); await this.#pullAndReconcile();
      const pending = await countPendingOperations(), conflicts = await countConflicts();
      return publishSyncState(conflicts ? SYNC_STATE.CONFLICT : pending ? SYNC_STATE.PENDING : SYNC_STATE.SYNCED, { pending, conflicts });
    } catch (error) {
      const pending = await countPendingOperations();
      // Une coupure n'est pas une panne : les saisies sont en securite, elles attendent le reseau.
      if (estPanneReseau(error)) return publishSyncState(SYNC_STATE.OFFLINE, { pending });
      return publishSyncState(SYNC_STATE.ERROR, { pending, message: error.message });
    }
  }
  async #pullAndReconcile() {
    // Le curseur est unique pour toutes les tables : il avance jusqu'a la ligne la plus recente
    // vue, toutes tables confondues. Ajouter une table apres coup la condamnait donc au silence -
    // ses lignes, plus anciennes que le curseur, n'etaient jamais redescendues. C'est ce qui a
    // vide le planning quand les creneaux ont rejoint la liste.
    //
    // Des que la liste change, on repart de zero. Une relecture complete, une seule fois.
    const signature = (this.#adapter.tables || []).join(",");
    const couverte = await getMeta(TABLES_KEY);
    const listeChangee = couverte !== signature;
    if (listeChangee) await setMeta(CURSOR_KEY, undefined);

    let cursor = listeChangee ? undefined : await getMeta(CURSOR_KEY), more = true;
    while (more) {
      const page = await this.#adapter.pullChanges({ cursor, limit: this.#batchSize });
      for (const serverRecord of page.records || []) await this.#applyServerRecord(serverRecord);
      cursor = page.cursor ?? cursor; more = Boolean(page.hasMore); if (cursor) await setMeta(CURSOR_KEY, cursor);
    }
    // Apres coup seulement : si la relecture echoue en route, la prochaine synchronisation la
    // recommencera depuis le debut au lieu de croire la nouvelle table deja couverte.
    if (listeChangee) await setMeta(TABLES_KEY, signature);
  }
  async #applyServerRecord(serverRecord) {
    const operations = await operationsForRecord(`${serverRecord.entity}:${serverRecord.id}`);
    if (!operations.length) return saveLocalRecord(serverRecord);
    for (const operation of operations) {
      if (operation.baseVersion === serverRecord.version) continue;
      if (operation.action === "delete" || serverRecord.deleted) {
        await storeConflict({ operation, serverRecord, overlappingFields: ["__deleted__"] });
        await acknowledgeOperation(operation.opId);
        continue;
      }
      const result = mergeOfflineChange({ baseData: operation.baseData, localData: operation.data, serverData: serverRecord.data, declaredLocalFields: operation.changedFields });
      if (result.kind === "conflict") {
        await storeConflict({ operation, serverRecord, overlappingFields: result.overlappingFields });
        await acknowledgeOperation(operation.opId);
      }
      else {
        await replaceOperation(operation, { baseVersion: serverRecord.version, baseData: serverRecord.data, data: result.data, changedFields: result.localFields });
        await saveLocalRecord({ ...serverRecord, data: result.data });
      }
    }
  }
  async #pushPending() {
    let batch = await pendingOperations(this.#batchSize);
    while (batch.length) {
      for (const operation of batch) {
        try {
          const result = await this.#adapter.pushOperation(operation);
          // Refus definitif : la reprise ne servirait a rien. On sort l'operation de la file, on
          // remet la fiche dans l'etat du serveur pour que l'ecran cesse d'annoncer une
          // modification qui n'aura pas lieu, et on garde une trace visible pour le professeur.
          if (result.status === "rejected") {
            await storeRejection({ operation, serverRecord: result.serverRecord, reason: result.reason });
            if (result.serverRecord) await saveLocalRecord(result.serverRecord);
            await acknowledgeOperation(operation.opId);
            continue;
          }
          if (result.status === "conflict") {
            await storeConflict({ operation, serverRecord: result.serverRecord, overlappingFields: result.overlappingFields || operation.changedFields });
            await acknowledgeOperation(operation.opId);
            continue;
          }
          if (result.record) await saveLocalRecord(result.record);
          await acknowledgeOperation(operation.opId);
        } catch (error) { await deferOperation(operation, error); }
      }
      batch = await pendingOperations(this.#batchSize);
    }
  }
}
