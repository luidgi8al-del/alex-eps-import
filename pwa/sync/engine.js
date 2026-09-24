import { DEFAULT_BATCH_SIZE, MAX_TENTATIVES_ENVOI, PAGE_LECTURE, SYNC_STATE } from "../core/constants.js";
import { publishSyncState } from "../core/events.js";
import { estPanneReseau } from "../core/connectivity.js";
import { getMeta, setMeta } from "../storage/database.js";
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
/** Fenetre du rattrapage : une saisie plus ancienne que cela est deja arrivee, ou ne le sera jamais. */
const RATTRAPAGE_JOURS = 30;
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
      await this.#pullAndReconcile();
      await this.#rattraper();
      const sent = await this.#pushPending();
      // No writes: the first pull is sufficient. Do not read every table twice per refresh.
      if (sent) await this.#pullAndReconcile();
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
    let lues = 0;
    let more = true;
    while (more) {
      const page = await this.#adapter.pullChanges({ cursor, limit: PAGE_LECTURE });
      if (generationLocale() !== generationAuDepart) return;
      for (const serverRecord of page.records || []) await this.#applyServerRecord(serverRecord);
      if (generationLocale() !== generationAuDepart) return;
      lues += (page.records || []).length;
      // Une premiere lecture rapatrie tout l'etablissement : plusieurs minutes, pendant
      // lesquelles "Synchronisation..." seul ne distingue pas une attente normale d'un blocage.
      // Le compte qui avance est la seule chose qui fasse la difference, pour qui regarde.
      if (lues) publishSyncState(SYNC_STATE.SYNCING, { lues });
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
  /**
   * Rattrape les lignes recentes que la lecture par date a laissees passer.
   *
   * Voir TABLES_RATTRAPAGE dans l'adaptateur : une ligne saisie ailleurs et envoyee tard arrive
   * avec une date anterieure au curseur. On compare les identifiants et dates recentes du serveur a
   * la copie locale, et on lit ce qui manque ou ce qui est plus recent ailleurs.
   * Ne fait jamais echouer la synchronisation : elle reessaiera au prochain passage.
   * @param {{force?: boolean}} [options] force : sans attendre l'intervalle (ouverture d'un ecran)
   */
  async rattraper({ force = false } = {}) {
    if (!this.#adapter.identifiantsRecents || !this.#adapter.tablesRattrapables?.length) return 0;
    const dernier = await getMeta(RATTRAPAGE_KEY);
    if (!force && dernier && Date.now() - dernier < RATTRAPAGE_INTERVALLE_MS) return 0;
    const generation = generationLocale();
    const depuis = new Date(Date.now() - RATTRAPAGE_JOURS * 86400000).toISOString();
    let recuperees = 0;
    try {
      for (const table of this.#adapter.tablesRattrapables) {
        const recentes = await this.#adapter.identifiantsRecents(table, depuis);
        const manquantes = [];
        for (const r of recentes) {
          const local = await readLocalRecordMeta(table, r.id);
          if (!local || Date.parse(local.updatedAt) < Date.parse(r.updated_at)) manquantes.push(r.id);
        }
        for (let i = 0; i < manquantes.length; i += 50) {
          const records = await this.#adapter.lireParIdentifiants(table, manquantes.slice(i, i + 50));
          if (generationLocale() !== generation) return recuperees;
          for (const record of records) { await this.#applyServerRecord(record); recuperees++; }
        }
      }
      if (generationLocale() === generation) await setMeta(RATTRAPAGE_KEY, Date.now());
    } catch (error) {
      if (estPanneReseau(error)) throw error;
      console.warn("Rattrapage des lignes recentes interrompu :", error?.message || error);
    }
    return recuperees;
  }
  async #rattraper() { return this.rattraper(); }
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
    let sent = 0;
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
            const rapprochement = distant && !distant.deleted && operation.action !== "delete"
              ? mergeOfflineChange({
                  baseData: operation.baseData, localData: operation.data,
                  serverData: distant.data, declaredLocalFields: operation.changedFields
                })
              : { kind: "conflict", overlappingFields: result.overlappingFields || operation.changedFields };

            if (rapprochement.kind === "merged") {
              // Une seule reprise, tout de suite : si elle bute encore, c'est que la ligne bouge
              // vraiment sous nos pieds, et la question merite alors d'etre posee.
              const reprise = await this.#adapter.pushOperation({
                ...operation, baseVersion: distant.version, baseData: distant.data,
                data: rapprochement.data, changedFields: rapprochement.localFields
              });
              if (reprise.status === "ok") {
                if (reprise.record) await saveLocalRecord(reprise.record);
                await acknowledgeOperation(operation.opId);
                sent++;
                continue;
              }
            }
            await storeConflict({ operation, serverRecord: distant,
              overlappingFields: rapprochement.overlappingFields || result.overlappingFields || operation.changedFields });
            await acknowledgeOperation(operation.opId);
            continue;
          }
          if (result.record) await saveLocalRecord(result.record);
          await acknowledgeOperation(operation.opId);
          sent++;
        } catch (error) {
          // Connectivity failures are temporary, even after a long outage. Never move a
          // pending edit to permanent rejection just because the network failed repeatedly.
          if (estPanneReseau(error)) {
            await deferOperation(operation, error);
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
              reason: `abandon apres ${operation.attempts + 1} tentatives : ${error?.message || error}` });
            await acknowledgeOperation(operation.opId);
            continue;
          }
          await deferOperation(operation, error);
        }
      }
      batch = await pendingOperations(this.#batchSize);
    }
    return sent;
  }
}
