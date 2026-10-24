import { DEFAULT_BATCH_SIZE, MAX_TENTATIVES_ENVOI, PAGE_LECTURE, SYNC_STATE } from "../core/constants.js";
import { publishSyncState } from "../core/events.js";
import { estPanneReseau } from "../core/connectivity.js";
import { getMeta, setMeta, assertGeneration } from "../storage/database.js";
import { saveLocalRecord, countLocalRecords, generationLocale, readLocalRecordMeta } from "../storage/records.js";
import { acknowledgeOperation, countPendingOperations, deferOperation, operationsForRecord, pendingOperations, replaceOperation } from "./outbox.js";
import { countConflicts, storeConflict, storeRejection } from "./conflicts.js";
import { mergeOfflineChange } from "./merge.js";
const CURSOR_KEY = "last-server-cursor";
/** Nombre de fiches locales au moment ou le curseur a ete ecrit. Voir #pullAndReconcile. */
const FICHES_KEY = "records-at-cursor";
/** Derniere fois que les lignes arrivees tard ont ete rattrapees. */
const RATTRAPAGE_KEY = "dernier-rattrapage";
/** Au plus un rattrapage toutes les dix minutes : c'est une lecture d'identifiants, pas gratuite. */
const RATTRAPAGE_INTERVALLE_MS = 10 * 60 * 1000;
/**
 * A client timestamp is not proof that a server revision is obsolete: another
 * device may upload an older offline edit later, or have a different clock.
 * This shortcut is only safe for the known base revision, with a three-way
 * comparison proving no business-field collision. New revisions always merge.
 */
export function serverIsClearlyOlder(operation, serverRecord, now = Date.now()) {
  const baseVersion = Number(operation?.baseVersion), serverVersion = Number(serverRecord?.version);
  if (!(baseVersion > 0) || serverVersion !== baseVersion
    || !operation?.baseData || !operation?.data || !serverRecord?.data
    || operation.action === 'delete' || serverRecord.deleted) return false;
  const local = Date.parse(operation?.createdAt || "");
  const distant = Date.parse(serverRecord?.updatedAt || "");
  return Number.isFinite(local) && Number.isFinite(distant)
    && local <= now + 5 * 60 * 1000 && local - distant > 5 * 60 * 1000
    && mergeOfflineChange({ baseData: operation.baseData, localData: operation.data,
      serverData: serverRecord.data, declaredLocalFields: operation.changedFields }).kind === 'merged';
}

function applyLocalFieldsToServer(operation, serverRecord) {
  const data = { ...(serverRecord?.data || {}) };
  for (const field of operation.changedFields || []) {
    if (Object.prototype.hasOwnProperty.call(operation.data || {}, field)) data[field] = operation.data[field];
    else delete data[field];
  }
  return { kind: "merged", data, localFields: operation.changedFields || [], overlappingFields: [] };
}
export class OfflineSyncEngine {
  #adapter; #batchSize; #running; #catchUpRunning; #paused = false;
  constructor({ adapter, batchSize = DEFAULT_BATCH_SIZE }) {
    if (!adapter?.pullChanges || !adapter?.pushOperation) throw new TypeError("Adaptateur de synchronisation incomplet");
    this.#adapter = adapter; this.#batchSize = batchSize;
  }
  async sync() {
    if (this.#paused) return {state:'pending'};
    if (this.#running) return this.#running;
    if (!navigator.onLine) {
      const generation = generationLocale(), pending = await countPendingOperations();
      assertGeneration(generation);
      return publishSyncState(SYNC_STATE.OFFLINE, { pending });
    }
    this.#running = this.#run().finally(() => { this.#running = null; }); return this.#running;
  }
  async withExclusiveRecovery(action) {
    if (this.#paused) throw Error('Une récupération est déjà en cours.');
    this.#paused=true;
    try { await this.#running; return await action(); }
    finally { this.#paused=false; }
  }
  async #run() {
    const generation = generationLocale();
    publishSyncState(SYNC_STATE.SYNCING);
    try {
      await this.#pullAndReconcile(generation);
      assertGeneration(generation);
      await this.rattraper({ generation });
      assertGeneration(generation);
      const sent = await this.#pushPending(generation);
      // No writes: the first pull is sufficient. Do not read every table twice per refresh.
      if (sent) await this.#pullAndReconcile(generation);
      const pending = await countPendingOperations(), conflicts = await countConflicts();
      assertGeneration(generation);
      return publishSyncState(conflicts ? SYNC_STATE.CONFLICT : pending ? SYNC_STATE.PENDING : SYNC_STATE.SYNCED,
        { pending, conflicts, lastSuccessfulAt: new Date().toISOString() });
    } catch (error) {
      // A cancelled account must never publish its counters/success into the next account.
      if (generationLocale() !== generation || error?.name === 'AccountChangedError') return { state: 'cancelled', reason: 'account-changed' };
      const pending = await countPendingOperations();
      if (generationLocale() !== generation) return { state: 'cancelled', reason: 'account-changed' };
      // Une coupure n'est pas une panne : les saisies sont en securite, elles attendent le reseau.
      if (estPanneReseau(error)) return publishSyncState(SYNC_STATE.OFFLINE, { pending });
      return publishSyncState(SYNC_STATE.ERROR, { pending, message: error.message });
    }
  }
  async #pullAndReconcile(generationAuDepart) {
    // L'adaptateur tient un curseur par table : une table qui rejoint la liste n'a pas encore de
    // repere, et se lit donc depuis le debut sans qu'on ait a le demander.
    let cursor = await getMeta(CURSOR_KEY, generationAuDepart);

    // Un curseur qui a connu des fiches, en face d'une copie devenue vide, ne veut plus rien
    // dire : il affirme que tout a ete lu alors qu'il ne reste rien, et plus rien ne redescend.
    // On repart alors de zero. La comparaison porte sur le nombre de fiches au moment ou le
    // curseur a ete ecrit, et non sur le vide seul : un compte qui n'a legitimement aucune
    // donnee ne doit pas relire toute la base a chaque synchronisation.
    // Un curseur ecrit par une version anterieure n'a pas de repere : sa provenance est inconnue,
    // et c'est precisement l'etat dans lequel un changement de compte a pu laisser l'application.
    // On le traite comme suspect une fois, puis on pose le repere pour ne plus y revenir.
    const fichesAuCurseur = await getMeta(FICHES_KEY, generationAuDepart);
    const repereInconnu = fichesAuCurseur === undefined;
    if (cursor && (repereInconnu || fichesAuCurseur > 0) && (await countLocalRecords()) === 0) {
      cursor = undefined;
      await setMeta(CURSOR_KEY, undefined, generationAuDepart);
      await setMeta(FICHES_KEY, 0, generationAuDepart);
    }

    // La generation change quand la copie locale est effacee - a la deconnexion ou au changement
    // de compte. Une lecture commencee avant ne doit pas enregistrer son curseur apres.
    let lues = 0;
    let more = true;
    while (more) {
      assertGeneration(generationAuDepart);
      const page = await this.#adapter.pullChanges({ cursor, limit: PAGE_LECTURE });
      assertGeneration(generationAuDepart);
      for (const serverRecord of page.records || []) await this.#applyServerRecord(serverRecord, generationAuDepart);
      assertGeneration(generationAuDepart);
      lues += (page.records || []).length;
      // Une premiere lecture rapatrie tout l'etablissement : plusieurs minutes, pendant
      // lesquelles "Synchronisation..." seul ne distingue pas une attente normale d'un blocage.
      // Le compte qui avance est la seule chose qui fasse la difference, pour qui regarde.
      if (lues) publishSyncState(SYNC_STATE.SYNCING, { lues });
      const precedent = JSON.stringify(cursor ?? null);
      cursor = page.cursor ?? cursor; more = Boolean(page.hasMore);
      if (cursor) {
        await setMeta(CURSOR_KEY, cursor, generationAuDepart);
        await setMeta(FICHES_KEY, await countLocalRecords(), generationAuDepart);
      }
      // Une page qui annonce une suite sans faire avancer le repere demanderait la meme chose
      // indefiniment. C'est arrive, et cela ne se voyait que comme une synchronisation qui ne
      // finissait jamais - le pire des symptomes, puisque rien n'indique ou chercher. Mieux vaut
      // s'arreter avec ce qu'on a : la lecture reprendra au prochain passage.
      if (more && JSON.stringify(cursor ?? null) === precedent) {
        throw new Error("Téléchargement incomplet : la synchronisation doit être relancée.");
      }
    }
  }
  /**
   * Rattrape les lignes recentes que la lecture par date a laissees passer.
   *
   * Une ligne saisie ailleurs et envoyee tard arrive
   * avec une date anterieure au curseur. On compare les identifiants et dates recentes du serveur a
   * la copie locale, et on lit ce qui manque ou ce qui est plus recent ailleurs.
   * Un échec est signalé, puis réessayé au prochain passage : pas de faux état synchronisé.
   * @param {{force?: boolean}} [options] force : sans attendre l'intervalle (ouverture d'un ecran)
   */
  async rattraper(options = {}) {
    const generation = options.generation ?? generationLocale();
    if (this.#catchUpRunning?.generation === generation) return this.#catchUpRunning.promise;
    const entry = { generation };
    entry.promise = this.#rattraperCompte({ ...options, generation }).finally(() => {
      if (this.#catchUpRunning === entry) this.#catchUpRunning = undefined;
    });
    this.#catchUpRunning = entry;
    return entry.promise;
  }
  async #rattraperCompte({ force = false, generation }) {
    if (this.#paused) return 0;
    if (!this.#adapter.identifiantsRecents || !this.#adapter.tablesRattrapables?.length) return 0;
    const dernier = await getMeta(RATTRAPAGE_KEY, generation);
    if (!force && dernier && Date.now() - dernier < RATTRAPAGE_INTERVALLE_MS) return 0;
    // A device may reconnect after more than a month; authored timestamps are not
    // receipt timestamps. Include old tombstones too, on every synchronized table.
    const depuis = '1970-01-01T00:00:00.000Z';
    let recuperees = 0;
    try {
      for (const table of this.#adapter.tablesRattrapables) {
        assertGeneration(generation);
        const recentes = await this.#adapter.identifiantsRecents(table, depuis);
        assertGeneration(generation);
        const manquantes = [];
        for (const r of recentes) {
          const local = await readLocalRecordMeta(table, r.id);
          assertGeneration(generation);
          if (!local || Number(r.version || 0) > Number(local.version || 0)
            || Date.parse(local.updatedAt) < Date.parse(r.updated_at)) manquantes.push(r.id);
        }
        for (let i = 0; i < manquantes.length; i += 50) {
          const records = await this.#adapter.lireParIdentifiants(table, manquantes.slice(i, i + 50));
          assertGeneration(generation);
          for (const record of records) { await this.#applyServerRecord(record, generation); recuperees++; }
        }
      }
      await setMeta(RATTRAPAGE_KEY, Date.now(), generation);
    } catch (error) {
      if (error?.name === 'AccountChangedError') throw error;
      // Do not announce a complete synchronization after an incomplete catch-up.
      throw error;
    }
    return recuperees;
  }
  async #applyServerRecord(serverRecord, generation) {
    assertGeneration(generation);
    const operations = await operationsForRecord(`${serverRecord.entity}:${serverRecord.id}`);
    assertGeneration(generation);
    const local = await readLocalRecordMeta(serverRecord.entity, serverRecord.id);
    assertGeneration(generation);
    // A stale response must not roll a known revision backwards, including fields
    // that the pending edit did not touch. A real rollback needs explicit review.
    if (Number(serverRecord.version) > 0 && Number(local?.version) > Number(serverRecord.version)) return;
    if (!operations.length) return saveLocalRecord(serverRecord, generation);
    for (const operation of operations) {
      if (Number(serverRecord.version) > 0 && Number(operation.baseVersion) > Number(serverRecord.version)) continue;
      if (operation.baseVersion === serverRecord.version) continue;
      if (operation.action === "delete" || serverRecord.deleted) {
        await storeConflict({ operation, serverRecord, overlappingFields: ["__deleted__"] }, generation);
        await acknowledgeOperation(operation.opId, generation);
        continue;
      }
      const result = serverIsClearlyOlder(operation, serverRecord)
        ? applyLocalFieldsToServer(operation, serverRecord)
        : mergeOfflineChange({ baseData: operation.baseData, localData: operation.data, serverData: serverRecord.data, declaredLocalFields: operation.changedFields });
      if (result.kind === "conflict") {
        await storeConflict({ operation, serverRecord, overlappingFields: result.overlappingFields }, generation);
        await acknowledgeOperation(operation.opId, generation);
      }
      else {
        await replaceOperation(operation, { baseVersion: serverRecord.version, baseData: serverRecord.data, data: result.data, changedFields: result.localFields }, generation);
        await saveLocalRecord({ ...serverRecord, data: result.data }, generation);
      }
    }
  }
  async #pushPending(generation) {
    let sent = 0;
    let batch = await pendingOperations(this.#batchSize);
    while (batch.length) {
      for (const operation of batch) {
        try {
          assertGeneration(generation);
          const result = await this.#adapter.pushOperation(operation);
          assertGeneration(generation);
          // Refus definitif : la reprise ne servirait a rien. On sort l'operation de la file, on
          // remet la fiche dans l'etat du serveur pour que l'ecran cesse d'annoncer une
          // modification qui n'aura pas lieu, et on garde une trace visible pour le professeur.
          if (result.status === "rejected") {
            await storeRejection({ operation, serverRecord: result.serverRecord, reason: result.reason }, generation);
            if (result.serverRecord) await saveLocalRecord(result.serverRecord, generation);
            await acknowledgeOperation(operation.opId, generation);
            continue;
          }
          // Un desaccord de version ne veut pas dire un desaccord de contenu.
          //
          // Toute ligne dont le numero de version avait bouge depuis la saisie devenait une
          // "saisie a trancher", meme quand personne n'avait touche aux memes champs. Or
          // l'application Android ecrit ces memes tables sans annoncer de version : chacune de
          // ses synchronisations incremente le compteur, et la modification suivante faite sur
          // le site arrivait donc perimee. Le professeur se retrouvait a arbitrer, plusieurs
          // fois par jour, des desaccords qui n'existaient pas.
          //
          // On refait donc ici le rapprochement champ par champ deja fait a la descente (voir
          // #applyServerRecord) : si le serveur n'a pas touche a ce que l'on modifie, on repart
          // de sa version et on renvoie sans rien demander. La question n'est posee que lorsqu'un
          // meme champ a change des deux cotes - ce pour quoi cet ecran existe.
          if (result.status === "conflict") {
            const distant = result.serverRecord;
            const revisionRegressed = Number(distant?.version) > 0 && Number(operation.baseVersion) > Number(distant.version);
            const rapprochement = distant && !revisionRegressed && !distant.deleted && operation.action !== "delete"
              ? (serverIsClearlyOlder(operation, distant)
                ? applyLocalFieldsToServer(operation, distant)
                : mergeOfflineChange({
                  baseData: operation.baseData, localData: operation.data,
                  serverData: distant.data, declaredLocalFields: operation.changedFields
                }))
              : { kind: "conflict", overlappingFields: revisionRegressed
                ? [...new Set([...(operation.changedFields || []), '__version__'])]
                : result.overlappingFields || operation.changedFields };

            if (rapprochement.kind === "merged") {
              // Une seule reprise, tout de suite : si elle bute encore, c'est que la ligne bouge
              // vraiment sous nos pieds, et la question merite alors d'etre posee.
              const reprise = await this.#adapter.pushOperation({
                ...operation, baseVersion: distant.version, baseData: distant.data,
                data: rapprochement.data, changedFields: rapprochement.localFields
              });
              assertGeneration(generation);
              if (reprise.status === "ok") {
                if (reprise.record) await saveLocalRecord(reprise.record, generation);
                await acknowledgeOperation(operation.opId, generation);
                sent++;
                continue;
              }
            }
            await storeConflict({ operation, serverRecord: distant,
              overlappingFields: rapprochement.overlappingFields || result.overlappingFields || operation.changedFields }, generation);
            await acknowledgeOperation(operation.opId, generation);
            continue;
          }
          if (result.record) await saveLocalRecord(result.record, generation);
          await acknowledgeOperation(operation.opId, generation);
          sent++;
        } catch (error) {
          assertGeneration(generation);
          if (error?.name === 'AccountChangedError' || error?.name === 'AccountMismatchError') throw error;
          // Connectivity failures are temporary, even after a long outage. Never move a
          // pending edit to permanent rejection just because the network failed repeatedly.
          if (estPanneReseau(error)) {
            await deferOperation(operation, error, generation);
            throw error;
          }
          // Une operation qui echoue sans fin doit finir par s'arreter.
          //
          // Un refus que l'adaptateur ne sait pas nommer etait repris indefiniment : chaque
          // reprise echouait, en occupant le serveur, sans que personne l'apprenne jamais. Au
          // bout de quelques tentatives on cesse, et le refus devient visible dans le panneau
          // des conflits - avec son message. Mieux vaut un probleme qu'on voit qu'une boucle
          // qu'on ne voit pas.
          if (operation.attempts + 1 >= MAX_TENTATIVES_ENVOI) {
            await storeRejection({ operation, serverRecord: null,
              reason: `abandon apres ${operation.attempts + 1} tentatives : ${error?.message || error}` }, generation);
            await acknowledgeOperation(operation.opId, generation);
            continue;
          }
          await deferOperation(operation, error, generation);
        }
      }
      assertGeneration(generation);
      batch = await pendingOperations(this.#batchSize);
    }
    return sent;
  }
}
