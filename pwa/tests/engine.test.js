/**
 * Tests du moteur hors connexion : file d'attente, reprises, fusion, conflits.
 *
 * Ce que merge.test.mjs couvrait tenait en deux cas de fusion. Ici on exerce le chemin complet -
 * une saisie hors ligne, son envoi, son echec, sa reprise, sa fusion avec le serveur - parce que
 * c'est la que se perdent les donnees, pas dans une comparaison de champs.
 */
import { test, assert, assertEgal, assertRejette, lancer } from "./harness.js";
import { STORES, SYNC_STATE } from "../core/constants.js";
import { transaction, getMeta, setMeta } from "../storage/database.js";
import { listLocalRecords, readLocalRecord, saveLocalRecord, removeAllLocalData, countLocalRecords } from "../storage/records.js";
import { saveOfflineEdit, saveOfflineDeletion } from "../sync/local-edits.js";
import { countPendingOperations, pendingOperations, operationsForRecord, deferOperation } from "../sync/outbox.js";
import { countConflicts, listConflicts } from "../sync/conflicts.js";
import { resolveConflict, buildFieldChoice, acknowledgeRejection } from "../sync/resolve.js";
import { OfflineSyncEngine } from "../sync/engine.js";
import { currentSyncState } from "../core/events.js";

/** Table rase entre deux cas : un reste de file d'attente fausserait le suivant. */
export async function viderTout() {
  await transaction(Object.values(STORES), "readwrite", stores =>
    Object.values(STORES).forEach(nom => { if (nom !== STORES.META) stores[nom].clear(); }));
}

/** Serveur simule : on lui dicte ce qu'il renvoie, et on lit ce qu'il a recu. */
function serveurFactice({ pages = [], reponsePush } = {}) {
  const recu = [];
  let index = 0;
  return {
    recu,
    async pullChanges() { return pages[index++] || { records: [], hasMore: false }; },
    async pushOperation(operation) {
      recu.push(operation);
      return reponsePush ? reponsePush(operation) : { status: "ok", record: null };
    }
  };
}

const eleve = { nom: "Dupont", division: "2.1", mail: "d@ex.fr" };

// ---------------------------------------------------------------- file d'attente

test("une saisie hors ligne est conservee et mise en attente", async () => {
  const { changed, operation } = await saveOfflineEdit({ entity: "eleve", id: "1", data: eleve, authorId: "moi" });
  assert(changed, "la saisie aurait du etre retenue");
  assertEgal(operation.changedFields, ["division", "mail", "nom"], "champs modifies");
  assertEgal(await countPendingOperations(), 1, "une operation en attente");
  const local = await readLocalRecord("eleve", "1");
  assertEgal(local.data, eleve, "la fiche doit etre lisible hors connexion");
});

test("resaisir la meme valeur ne cree pas d'operation", async () => {
  await saveOfflineEdit({ entity: "eleve", id: "1", data: eleve });
  const seconde = await saveOfflineEdit({ entity: "eleve", id: "1", data: { ...eleve } });
  assert(!seconde.changed, "aucun changement ne devait etre detecte");
  assertEgal(await countPendingOperations(), 1, "la file ne doit pas grossir pour rien");
});

test("les donnees sont rangees en clair, comme decide", async () => {
  // Choix assume : le chiffrement precedent gardait sa cle dans la meme base que les donnees, donc
  // ne protegeait de rien, et coutait un dechiffrement par fiche a chaque affichage. Ce test fige
  // la decision, pour qu'un retour en arriere soit delibere et non accidentel.
  await saveOfflineEdit({ entity: "eleve", id: "1", data: eleve });
  const lignes = await new Promise(resolve => {
    const requete = indexedDB.open("eps-lvh-offline");
    requete.onsuccess = () => {
      const tx = requete.result.transaction(STORES.RECORDS, "readonly");
      tx.objectStore(STORES.RECORDS).getAll().onsuccess = e => resolve(e.target.result);
    };
  });
  assert(JSON.stringify(lignes).includes("Dupont"), "la fiche doit etre rangee telle quelle");
  const relue = await readLocalRecord("eleve", "1");
  assertEgal(relue.data, eleve, "et rester relisible par le moteur");
});

// ---------------------------------------------------------------- envoi et reprises

test("un envoi reussi vide la file", async () => {
  await saveOfflineEdit({ entity: "eleve", id: "1", data: eleve });
  const serveur = serveurFactice({ reponsePush: () => ({ status: "ok" }) });
  await new OfflineSyncEngine({ adapter: serveur }).sync();
  assertEgal(await countPendingOperations(), 0, "la file doit etre vide apres envoi");
  assertEgal(serveur.recu.length, 1, "une operation envoyee");
  assertEgal(currentSyncState().state, SYNC_STATE.SYNCED, "etat final");
});

test("un envoi qui echoue garde la saisie et la reporte", async () => {
  await saveOfflineEdit({ entity: "eleve", id: "1", data: eleve });
  const serveur = serveurFactice({ reponsePush: () => { throw new Error("reseau coupe"); } });
  await new OfflineSyncEngine({ adapter: serveur }).sync();
  assertEgal(await countPendingOperations(), 1, "la saisie ne doit pas disparaitre");
  const [operation] = await operationsForRecord("eleve:1");
  assertEgal(operation.attempts, 1, "une tentative comptee");
  assert(Date.parse(operation.retryAt) > Date.now(), "la reprise doit etre repoussee dans le futur");
  assertEgal(currentSyncState().state, SYNC_STATE.PENDING, "etat final");
});

test("une operation reportee n'est pas reprise avant l'heure", async () => {
  const { operation } = await saveOfflineEdit({ entity: "eleve", id: "1", data: eleve });
  await deferOperation({ ...operation, baseData: {}, data: eleve }, new Error("coupure"));
  const pretes = await pendingOperations();
  assertEgal(pretes.length, 0, "rien ne doit etre pret tout de suite");
  assertEgal(await countPendingOperations(), 1, "mais l'operation reste en file");
});

test("le report s'allonge a chaque echec, sans depasser le plafond", async () => {
  const { operation } = await saveOfflineEdit({ entity: "eleve", id: "1", data: eleve });
  let courante = { ...operation, baseData: {}, data: eleve };
  const attentes = [];
  for (let i = 0; i < 12; i++) {
    const avant = Date.now();
    await deferOperation(courante, new Error("coupure"));
    [courante] = await operationsForRecord("eleve:1");
    courante = { ...courante, baseData: {}, data: eleve };
    attentes.push(Date.parse(courante.retryAt) - avant);
  }
  assert(attentes[1] > attentes[0], "le delai doit croitre");
  assert(Math.max(...attentes) <= 5 * 60 * 1000 + 1500, "le delai ne doit pas s'envoler");
});

// ---------------------------------------------------------------- fusion au retour

test("une modification du serveur sur un autre champ fusionne sans conflit", async () => {
  await saveLocalRecord({ entity: "eleve", id: "1", data: eleve, version: 1 });
  await saveOfflineEdit({ entity: "eleve", id: "1", data: { ...eleve, mail: "nouveau@ex.fr" } });
  const serveur = serveurFactice({
    pages: [{ records: [{ entity: "eleve", id: "1", version: 2, updatedAt: new Date().toISOString(),
                          data: { ...eleve, division: "2.4" } }], hasMore: false }],
    reponsePush: () => ({ status: "ok" })
  });
  await new OfflineSyncEngine({ adapter: serveur }).sync();
  const local = await readLocalRecord("eleve", "1");
  assertEgal(local.data.mail, "nouveau@ex.fr", "ma saisie doit survivre");
  assertEgal(local.data.division, "2.4", "la modification du collegue doit survivre");
  assertEgal(await countConflicts(), 0, "aucun conflit attendu");
});

test("une modification du serveur sur le meme champ leve un conflit", async () => {
  await saveLocalRecord({ entity: "eleve", id: "1", data: eleve, version: 1 });
  await saveOfflineEdit({ entity: "eleve", id: "1", data: { ...eleve, division: "2.4" } });
  const serveur = serveurFactice({
    pages: [{ records: [{ entity: "eleve", id: "1", version: 2, updatedAt: new Date().toISOString(),
                          authorId: "collegue", data: { ...eleve, division: "2.9" } }], hasMore: false }]
  });
  await new OfflineSyncEngine({ adapter: serveur }).sync();
  assertEgal(await countConflicts(), 1, "un conflit attendu");
  const [conflit] = await listConflicts();
  assertEgal(conflit.overlappingFields, ["division"], "le champ en cause");
  assertEgal(conflit.localData.division, "2.4", "ma version doit rester consultable");
  assertEgal(conflit.serverData.division, "2.9", "celle du collegue aussi");
  assertEgal(currentSyncState().state, SYNC_STATE.CONFLICT, "etat final");
});

test("un conflit vide la file : la saisie ne repartira jamais seule", async () => {
  // Comportement actuel, teste pour qu'il soit visible : la donnee survit dans la fiche de
  // conflit, mais plus rien ne la renverra tant qu'aucun ecran ne la resout.
  await saveLocalRecord({ entity: "eleve", id: "1", data: eleve, version: 1 });
  await saveOfflineEdit({ entity: "eleve", id: "1", data: { ...eleve, division: "2.4" } });
  const serveur = serveurFactice({
    pages: [{ records: [{ entity: "eleve", id: "1", version: 2, updatedAt: new Date().toISOString(),
                          data: { ...eleve, division: "2.9" } }], hasMore: false }]
  });
  await new OfflineSyncEngine({ adapter: serveur }).sync();
  assertEgal(await countPendingOperations(), 0, "la file est videe par le conflit");
  assertEgal(serveur.recu.length, 0, "et rien n'a ete envoye");
});

test("une suppression locale face a une modification distante leve un conflit", async () => {
  await saveLocalRecord({ entity: "eleve", id: "1", data: eleve, version: 1 });
  await saveOfflineDeletion({ entity: "eleve", id: "1" });
  const serveur = serveurFactice({
    pages: [{ records: [{ entity: "eleve", id: "1", version: 2, updatedAt: new Date().toISOString(),
                          data: { ...eleve, mail: "change@ex.fr" } }], hasMore: false }]
  });
  await new OfflineSyncEngine({ adapter: serveur }).sync();
  assertEgal(await countConflicts(), 1, "supprimer ici et modifier ailleurs doit se signaler");
});

test("un enregistrement distant sans saisie locale s'applique tel quel", async () => {
  const serveur = serveurFactice({
    pages: [{ records: [{ entity: "eleve", id: "9", version: 3, updatedAt: new Date().toISOString(),
                          data: { nom: "Martin" } }], hasMore: false }]
  });
  await new OfflineSyncEngine({ adapter: serveur }).sync();
  const local = await readLocalRecord("eleve", "9");
  assertEgal(local.data, { nom: "Martin" }, "la fiche distante doit etre posee localement");
  assertEgal(local.version, 3, "avec sa version");
});

// ---------------------------------------------------------------- lecture et reprise

test("le curseur est retenu d'une synchro a l'autre", async () => {
  const serveur = serveurFactice({ pages: [{ records: [], cursor: "2026-09-02T10:00:00Z", hasMore: false }] });
  await new OfflineSyncEngine({ adapter: serveur }).sync();
  assertEgal(await getMeta("last-server-cursor"), "2026-09-02T10:00:00Z", "le curseur doit survivre");
});

test("les fiches supprimees sont masquees de la liste", async () => {
  await saveLocalRecord({ entity: "eleve", id: "1", data: eleve });
  await saveLocalRecord({ entity: "eleve", id: "2", data: { nom: "Parti" }, deleted: true });
  assertEgal((await listLocalRecords("eleve")).length, 1, "seule la fiche vivante");
  assertEgal((await listLocalRecords("eleve", { includeDeleted: true })).length, 2, "les deux si demande");
});

test("un adaptateur incomplet est refuse a la construction", async () => {
  let refuse = false;
  try { new OfflineSyncEngine({ adapter: {} }); } catch { refuse = true; }
  assert(refuse, "un adaptateur sans pullChanges ni pushOperation doit etre refuse");
});

// ---------------------------------------------------------------- resolution des conflits

/** Amene le moteur dans un etat de conflit sur la division, point de depart des cas suivants. */
async function provoquerUnConflit() {
  await saveLocalRecord({ entity: "eleve", id: "1", data: eleve, version: 1 });
  await saveOfflineEdit({ entity: "eleve", id: "1", data: { ...eleve, division: "2.4" }, authorId: "moi" });
  const serveur = serveurFactice({
    pages: [{ records: [{ entity: "eleve", id: "1", version: 2, updatedAt: new Date().toISOString(),
                          data: { ...eleve, division: "2.9", mail: "serveur@ex.fr" } }], hasMore: false }]
  });
  await new OfflineSyncEngine({ adapter: serveur }).sync();
  const [conflit] = await listConflicts();
  return conflit;
}

test("garder ma version remet la saisie dans la file", async () => {
  const conflit = await provoquerUnConflit();
  await resolveConflict(conflit.conflictId, "local");
  assertEgal(await countConflicts(), 0, "le conflit doit etre clos");
  assertEgal(await countPendingOperations(), 1, "et ma saisie repartir");
  const [operation] = await operationsForRecord("eleve:1");
  assertEgal(operation.baseVersion, 2, "elle doit partir de la version du serveur");
  const local = await readLocalRecord("eleve", "1");
  assertEgal(local.data.division, "2.4", "ma valeur est conservee localement");
});

test("garder la version enregistree n'envoie rien", async () => {
  const conflit = await provoquerUnConflit();
  await resolveConflict(conflit.conflictId, "server");
  assertEgal(await countConflicts(), 0, "le conflit doit etre clos");
  assertEgal(await countPendingOperations(), 0, "rien a renvoyer : le serveur l'a deja");
  const local = await readLocalRecord("eleve", "1");
  assertEgal(local.data.division, "2.9", "la version du serveur fait foi");
  assertEgal(local.version, 2, "avec sa version");
});

test("le choix champ par champ ne retient que ce qui est coche", async () => {
  const conflit = await provoquerUnConflit();
  const retenu = buildFieldChoice(conflit, { division: "local" });
  assertEgal(retenu.division, "2.4", "ma division");
  assertEgal(retenu.mail, "serveur@ex.fr", "mais le reste vient du serveur");
  await resolveConflict(conflit.conflictId, "merged", retenu);
  const local = await readLocalRecord("eleve", "1");
  assertEgal(local.data, { ...eleve, division: "2.4", mail: "serveur@ex.fr" }, "fiche resultante");
});

test("la saisie resolue part vraiment au serveur, sans reconflit", async () => {
  const conflit = await provoquerUnConflit();
  await resolveConflict(conflit.conflictId, "local");
  const serveur = serveurFactice({ reponsePush: () => ({ status: "ok" }) });
  await new OfflineSyncEngine({ adapter: serveur }).sync();
  assertEgal(serveur.recu.length, 1, "l'operation resolue doit etre envoyee");
  assertEgal(serveur.recu[0].data.division, "2.4", "avec ma valeur");
  assertEgal(await countPendingOperations(), 0, "et la file se vider");
  assertEgal(await countConflicts(), 0, "sans nouveau conflit");
});

test("resoudre en retenant exactement la version du serveur n'envoie rien", async () => {
  const conflit = await provoquerUnConflit();
  await resolveConflict(conflit.conflictId, "merged", { ...conflit.serverData });
  assertEgal(await countPendingOperations(), 0, "inutile de renvoyer une valeur identique");
  assertEgal(await countConflicts(), 0, "le conflit est clos malgre tout");
});

test("un conflit deja resolu ne peut pas l'etre deux fois", async () => {
  const conflit = await provoquerUnConflit();
  await resolveConflict(conflit.conflictId, "server");
  await assertRejette(() => resolveConflict(conflit.conflictId, "local"),
    "resoudre un conflit disparu doit echouer clairement");
});

test("un choix inconnu est refuse plutot que devine", async () => {
  const conflit = await provoquerUnConflit();
  await assertRejette(() => resolveConflict(conflit.conflictId, "peut-etre"),
    "un choix invalide doit lever une erreur");
  assertEgal(await countConflicts(), 1, "et laisser le conflit intact");
});

export { lancer };

// ---------------------------------------------------------------- refus de droits

test("une saisie refusee sort de la file au lieu d'etre rejouee", async () => {
  // Sans cela, un professeur non administrateur verrait "1 en attente" indefiniment : le moteur
  // reproposerait la meme saisie a chaque synchronisation, et le serveur la refuserait a chaque
  // fois. C'est le cas normal des que les eleves seront raccordes.
  await saveOfflineEdit({ entity: "eleve", id: "1", data: eleve, authorId: "moi" });
  const serveur = serveurFactice({
    reponsePush: () => ({
      status: "rejected", reason: "droits insuffisants",
      serverRecord: { entity: "eleve", id: "1", version: 4, updatedAt: "2026-09-03T10:00:00Z",
                      deleted: false, data: { nom: "Dupond", division: "2.1", mail: "d@ex.fr" } }
    })
  });
  await new OfflineSyncEngine({ adapter: serveur }).sync();

  assertEgal(await countPendingOperations(), 0, "la file doit etre vidée");
  assertEgal(await countConflicts(), 1, "le refus doit rester visible");
  const [refus] = await listConflicts();
  assertEgal(refus.kind, "refus", "range comme un refus, pas comme un conflit a arbitrer");
  const fiche = await readLocalRecord("eleve", "1");
  assertEgal(fiche.data.nom, "Dupond", "la fiche revient dans l'etat du serveur");
});

test("prendre acte d'un refus n'envoie rien et libere l'ecran", async () => {
  await saveOfflineEdit({ entity: "eleve", id: "1", data: eleve, authorId: "moi" });
  const serveur = serveurFactice({
    reponsePush: () => ({
      status: "rejected", reason: "droits insuffisants",
      serverRecord: { entity: "eleve", id: "1", version: 4, updatedAt: "2026-09-03T10:00:00Z",
                      deleted: false, data: { nom: "Dupond", division: "2.1", mail: "d@ex.fr" } }
    })
  });
  await new OfflineSyncEngine({ adapter: serveur }).sync();
  const [refus] = await listConflicts();
  await acknowledgeRejection(refus.conflictId);

  assertEgal(await countConflicts(), 0, "le refus est traite");
  assertEgal(await countPendingOperations(), 0, "et rien n'est renvoye");
  assertEgal((await readLocalRecord("eleve", "1")).data.nom, "Dupond", "la version du serveur reste");
});

test("une creation refusee ne laisse pas une fiche fantome a l'ecran", async () => {
  // Le serveur n'a rien : la fiche n'existe pour personne d'autre. La laisser affichee ferait
  // croire a une donnee partagee, et le professeur la chercherait en vain sur son telephone.
  await saveOfflineEdit({ entity: "eleve", id: "9", data: eleve, authorId: "moi" });
  const serveur = serveurFactice({
    reponsePush: () => ({ status: "rejected", reason: "droits insuffisants", serverRecord: null })
  });
  await new OfflineSyncEngine({ adapter: serveur }).sync();
  const [refus] = await listConflicts();
  await acknowledgeRejection(refus.conflictId);

  const visibles = await listLocalRecords("eleve");
  assertEgal(visibles.filter(r => r.id === "9").length, 0, "la fiche refusee disparait de la liste");
});

test("un curseur de l'ancienne forme est ignore", async () => {
  // Les copies locales existantes portent un curseur unique. Le reprendre tel quel laisserait
  // les tables incompletes le rester : on repart de zero une fois.
  const recu = [];
  const adaptateur = {
    tables: ["eleve"],
    async pullChanges({ cursor }) {
      recu.push(cursor);
      return { records: [], cursor: { eleve: { updatedAt: "2026-09-03T08:00:00Z", id: "x" } }, hasMore: false };
    },
    async pushOperation() { return { status: "ok" }; }
  };
  await setMeta("last-server-cursor", { updatedAt: "2026-09-03T08:00:00Z", id: "vieux" });
  await new OfflineSyncEngine({ adapter: adaptateur }).sync();
  assert(recu.length > 0, "la lecture doit avoir eu lieu");
});

test("chaque table garde son propre repere", async () => {
  // Le defaut d'origine : avec un curseur unique, une table dont les lignes sont plus anciennes
  // que celles d'une autre etait sautee pour toujours. Un etablissement entier de creneaux
  // disparaissait ainsi du planning partage.
  const rendus = [];
  const adaptateur = {
    tables: ["eleve", "creneau"],
    async pullChanges({ cursor }) {
      rendus.push(cursor);
      return {
        records: [],
        cursor: {
          eleve: { updatedAt: "2026-01-01T08:00:00Z", id: "e1" },
          creneau: { updatedAt: "2026-09-03T08:00:00Z", id: "c1" }
        },
        hasMore: false
      };
    },
    async pushOperation() { return { status: "ok" }; }
  };
  await new OfflineSyncEngine({ adapter: adaptateur }).sync();
  const dernier = rendus[rendus.length - 1];
  assertEgal(dernier.eleve.updatedAt, "2026-01-01T08:00:00Z", "l'eleve garde sa date ancienne");
  assertEgal(dernier.creneau.updatedAt, "2026-09-03T08:00:00Z", "sans etre entraine par le creneau plus recent");
});

// ---------------------------------------------------------------- effacement et curseur

test("un curseur sans copie locale est abandonne", async () => {
  // C'est l'etat dans lequel un changement de compte pouvait laisser l'application : plus une
  // seule fiche, mais un curseur affirmant que tout avait ete lu. Plus rien ne redescendait, et
  // l'ecran restait vide indefiniment.
  // Etat exact laisse par la version precedente : un curseur, et aucun repere du nombre de
  // fiches - le banc d'essai ne vide pas les metadonnees entre deux cas, il faut donc le poser.
  await setMeta("last-server-cursor", { eleve: { updatedAt: "2026-09-03T08:00:00Z", id: "x" } });
  await setMeta("records-at-cursor", undefined);
  const recu = [];
  const adaptateur = {
    tables: ["eleve"],
    async pullChanges({ cursor }) {
      recu.push(cursor);
      return { records: [{ entity: "eleve", id: "1", version: 1, updatedAt: "2026-01-01T08:00:00Z",
                           deleted: false, data: { nom: "Dupont" } }],
               cursor: { eleve: { updatedAt: "2026-01-01T08:00:00Z", id: "1" } }, hasMore: false };
    },
    async pushOperation() { return { status: "ok" }; }
  };
  await new OfflineSyncEngine({ adapter: adaptateur }).sync();

  assertEgal(recu[0], undefined, "la lecture doit repartir de zero");
  assert(await readLocalRecord("eleve", "1"), "et la fiche doit etre redescendue");
});

test("un effacement pendant une synchronisation n'avance pas le curseur", async () => {
  // La course qui a casse l'application : le changement de compte efface la copie locale pendant
  // qu'une lecture est en cours. Si cette lecture enregistre son curseur apres l'effacement, la
  // copie reste vide pour toujours.
  const adaptateur = {
    tables: ["eleve"],
    async pullChanges() {
      // L'effacement tombe pendant la lecture, comme au changement de compte.
      await removeAllLocalData();
      return { records: [{ entity: "eleve", id: "1", version: 1, updatedAt: "2026-09-03T08:00:00Z",
                           deleted: false, data: { nom: "Dupont" } }],
               cursor: { eleve: { updatedAt: "2026-09-03T08:00:00Z", id: "1" } }, hasMore: false };
    },
    async pushOperation() { return { status: "ok" }; }
  };
  await setMeta("records-at-cursor", 12);   // la copie contenait des fiches avant l'effacement
  await new OfflineSyncEngine({ adapter: adaptateur }).sync();

  assertEgal(await getMeta("last-server-cursor"), undefined,
    "aucun curseur ne doit survivre a l'effacement");
  assertEgal(await countLocalRecords(), 0, "et la copie reste vide, prete a etre relue entierement");
});
