import { DEFAULT_BATCH_SIZE, PAGE_LECTURE, SYNC_STATE } from "../core/constants.js";
import { publishSyncState } from "../core/events.js";
import { estPanneReseau } from "../core/connectivity.js";
import { getMeta, setMeta } from "../storage/database.js";
import { saveLocalRecord, countLocalRecords, generationLocale } from "../storage/records.js";
import { acknowledgeOperation, countPendingOperations, deferOperation, operationsForRecord, pendingOperations, replaceOperation } from "./outbox.js";
import { countConflicts, storeConflict, storeRejection } from "./conflicts.js";
import { mergeOfflineChange } from "./merge.js";
const CURSOR_KEY = "last-server-cursor";
/** Nombre de fiches locales au moment ou le curseur a ete ecrit. Voir #pullAndReconcile. */
const FICHES_KEY = "records-at-cursor";
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
    // L'adaptateur tient un curseur par table : une table qui rejoint la liste n'a pas encore de
    // repere, et se lit donc depuis le debut sans qu'on ait a le demander.
    let cursor = await getMeta(CURSOR_KEY);

    // Un curseur qui a connu des fiches, en face d'une copie devenue vide, ne veut plus rien
    // dire : il affirme que tout a ete lu alors qu'il ne reste rien, et plus rien ne redescend.
    // On repart alors de zero. La comparaison porte sur le nombre de fiches au moment ou le
    // curseur a ete ecrit, et non sur le vide seul : un compte qui n'a legitimement aucune
    // donnee ne doit pas relire toute la base a chaque synchronisation.
    // Un curseur ecrit par une version anterieure n'a pas de repere : sa provenance est inconnue,
    // et c'est precisement l'etat dans lequel un changement de compte a pu laisser l'application.
    // On le traite comme suspect une fois, puis on pose le repere pour ne plus y revenir.
    const fichesAuCurseur = await getMeta(FICHES_KEY);
    const repereInconnu = fichesAuCurseur === undefined;
    if (cursor && (repereInconnu || fichesAuCurseur > 0) && (await countLocalRecords()) === 0) {
      cursor = undefined;
      await setMeta(CURSOR_KEY, undefined);
      await setMeta(FICHES_KEY, 0);
    }

    // La generation change quand la copie locale est effacee - a la deconnexion ou au changement
    // de compte. Une lecture commencee avant ne doit pas enregistrer son curseur apres.
    const generationAuDepart = generationLocale();
    let more = true;
    while (more) {
      const page = await this.#adapter.pullChanges({ cursor, limit: PAGE_LECTURE });
      if (generationLocale() !== generationAuDepart) return;
      for (const serverRecord of page.records || []) await this.#applyServerRecord(serverRecord);
      if (generationLocale() !== generationAuDepart) return;
      const precedent = JSON.stringify(cursor ?? null);
      cursor = page.cursor ?? cursor; more = Boolean(page.hasMore);
      if (cursor) {
        await setMeta(CURSOR_KEY, cursor);
        await setMeta(FICHES_KEY, await countLocalRecords());
      }
      // Une page qui annonce une suite sans faire avancer le repere demanderait la meme chose
      // indefiniment. C'est arrive, et cela ne se voyait que comme une synchronisation qui ne
      // finissait jamais - le pire des symptomes, puisque rien n'indique ou chercher. Mieux vaut
      // s'arreter avec ce qu'on a : la lecture reprendra au prochain passage.
      if (more && JSON.stringify(cursor ?? null) === precedent) {
        console.warn("Synchronisation interrompue : le repere de lecture n'avance plus.");
        return;
      }
    }
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
