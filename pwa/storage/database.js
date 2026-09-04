import { DB_NAME, DB_VERSION, STORES } from "../core/constants.js";

/**
 * Une base locale par compte.
 *
 * La copie locale etait unique et effacee a chaque changement de compte : sans quoi le collegue
 * suivant, sur le meme ordinateur, aurait vu les donnees du precedent. Correct, mais couteux -
 * preparer trois comptes de collegues d'affilee, c'etait trois rapatriements complets de
 * l'etablissement, plusieurs milliers de fiches a chaque fois.
 *
 * Chaque compte a donc sa propre base, nommee par son identifiant. Basculer ne detruit plus rien
 * et revenir sur un compte deja visite retrouve sa copie intacte. L'isolement est meilleur
 * qu'avant, puisque les donnees ne se croisent jamais dans le meme espace.
 *
 * La deconnexion, elle, efface tout : quitter la session sur un ordinateur partage doit ne rien
 * laisser derriere soi.
 */
let compteCourant = null;
let generation = 0;

function nomBase(compte) {
  return compte ? `${DB_NAME}-${compte}` : DB_NAME;
}

/** Numero de generation de la copie locale, incremente a chaque effacement ou bascule. */
export function generationLocale() { return generation; }

/**
 * Designe le compte dont la copie doit etre utilisee. Sans effet s'il n'a pas change.
 *
 * La generation avance a la bascule : une synchronisation commencee sur le compte precedent ne
 * doit rien ecrire dans la base du suivant, ni y enregistrer son curseur.
 */
export function utiliserCompte(compte) {
  const cible = compte || null;
  if (cible === compteCourant) return;
  compteCourant = cible;
  generation += 1;
  const ancienne = opening;
  opening = undefined;
  ancienne?.then(db => db.close()).catch(() => {});
}

export function marquerEffacement() { generation += 1; }

/** Efface les copies locales de tous les comptes. Utilise a la deconnexion. */
export async function supprimerToutesLesBases() {
  generation += 1;
  const ancienne = opening;
  opening = undefined;
  await ancienne?.then(db => db.close()).catch(() => {});
  let noms = [];
  try {
    // indexedDB.databases() n'existe pas partout : sans elle on efface au moins la base courante.
    noms = (await indexedDB.databases?.() || []).map(b => b.name).filter(Boolean);
  } catch { noms = []; }
  if (!noms.length) noms = [nomBase(compteCourant)];
  const aSupprimer = noms.filter(n => n === DB_NAME || n.startsWith(`${DB_NAME}-`));
  await Promise.all(aSupprimer.map(nom => new Promise(resolve => {
    const demande = indexedDB.deleteDatabase(nom);
    demande.onsuccess = demande.onerror = demande.onblocked = () => resolve();
  })));
}

let opening;
export function openOfflineDatabase() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(nomBase(compteCourant), DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("La base hors connexion est bloquee par un autre onglet"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.RECORDS)) {
        const store = db.createObjectStore(STORES.RECORDS, { keyPath: "key" });
        store.createIndex("byEntity", "entity", { unique: false });
        store.createIndex("byUpdatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.OUTBOX)) {
        const store = db.createObjectStore(STORES.OUTBOX, { keyPath: "opId" });
        store.createIndex("byRecord", "recordKey", { unique: false });
        store.createIndex("byCreatedAt", "createdAt", { unique: false });
        store.createIndex("byRetryAt", "retryAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.CONFLICTS)) {
        const store = db.createObjectStore(STORES.CONFLICTS, { keyPath: "conflictId" });
        store.createIndex("byRecord", "recordKey", { unique: false });
        store.createIndex("byDetectedAt", "detectedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.META)) db.createObjectStore(STORES.META, { keyPath: "key" });
    };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(db); };
  }).catch(error => { opening = undefined; throw error; });
  return opening;
}
export async function transaction(storeNames, mode, action) {
  const db = await openOfflineDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode, { durability: mode === "readwrite" ? "relaxed" : "default" });
    const stores = Object.fromEntries(storeNames.map(name => [name, tx.objectStore(name)]));
    let result;
    try { result = action(stores, tx); } catch (error) { tx.abort(); reject(error); return; }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction annulee"));
  });
}
export function requestResult(request) {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
export async function getMeta(key) {
  const db = await openOfflineDatabase();
  return requestResult(db.transaction(STORES.META, "readonly").objectStore(STORES.META).get(key)).then(row => row?.value);
}
export async function setMeta(key, value) { return transaction([STORES.META], "readwrite", stores => stores[STORES.META].put({ key, value })); }
