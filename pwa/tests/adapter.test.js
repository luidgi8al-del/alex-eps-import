/**
 * Tests de l'adaptateur Supabase, contre un faux serveur.
 *
 * L'adaptateur est le seul endroit qui parle a Supabase : s'il traduit mal un refus de version, le
 * moteur reprendra la meme operation indefiniment ou perdra une saisie. Ces cas s'exercent sans
 * reseau, en remplacant fetch.
 */
import { test, assert, assertEgal, assertRejette } from "./harness.js";
import { createSupabaseAdapter } from "../sync/supabase-adapter.js";

const URL_FICTIVE = "https://exemple.supabase.co";
const session = () => ({ access_token: "jeton" });

/** Remplace fetch le temps d'un cas, et rend la liste des appels recus. */
function fauxReseau(repondre) {
  const appels = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    appels.push({ url: String(url), method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null });
    return repondre({ url: String(url), options, appels });
  };
  return { appels, rendre: () => { globalThis.fetch = original; } };
}

function reponse(corps, statut = 200) {
  return new Response(JSON.stringify(corps), { status: statut, headers: { "Content-Type": "application/json" } });
}

function adaptateur(tables = ["classes"]) {
  return createSupabaseAdapter({ url: URL_FICTIVE, anonKey: "cle", session, tables });
}

test("l'adaptateur refuse d'etre construit sans session", () => {
  let refuse = false;
  try { createSupabaseAdapter({ url: URL_FICTIVE, anonKey: "cle" }); } catch { refuse = true; }
  assert(refuse, "une construction incomplete doit echouer tout de suite");
});

test("sans jeton, rien n'est tente", async () => {
  const sansSession = createSupabaseAdapter({ url: URL_FICTIVE, anonKey: "cle", session: () => null });
  const reseau = fauxReseau(() => reponse([]));
  try {
    await assertRejette(() => sansSession.pullChanges({}), "une session absente doit lever");
    assertEgal(reseau.appels.length, 0, "et n'appeler personne");
  } finally { reseau.rendre(); }
});

test("la lecture demande les lignes triees et paginees", async () => {
  const reseau = fauxReseau(() => reponse([]));
  try {
    await adaptateur().pullChanges({ limit: 50 });
    const [appel] = reseau.appels;
    assert(appel.url.includes("order=updated_at.asc,id.asc"), "l'ordre doit etre stable");
    assert(appel.url.includes("limit=51"), "on demande une ligne de plus pour savoir s'il en reste");
    assert(appel.url.includes("updated_at=gte."), "et repartir du curseur");
  } finally { reseau.rendre(); }
});

test("la lecture traduit les lignes pour le moteur", async () => {
  const reseau = fauxReseau(() => reponse([
    { id: "c1", name: "6e1", version: 4, updated_at: "2026-09-03T08:00:00Z", deleted: false }
  ]));
  try {
    const page = await adaptateur().pullChanges({});
    assertEgal(page.records.length, 1, "une ligne");
    const [r] = page.records;
    assertEgal(r.entity, "classes", "la table devient l'entite");
    assertEgal(r.version, 4, "la version est reprise");
    assertEgal(r.data.name, "6e1", "la ligne entiere est conservee");
    assertEgal(page.cursor, { classes: { updatedAt: "2026-09-03T08:00:00Z", id: "c1" } },
      "le curseur est range par table");
  } finally { reseau.rendre(); }
});

test("une ligne deja vue au meme instant n'est pas relue deux fois", async () => {
  // Le filtre de date est inclusif : sans ce tri fin, la derniere ligne de chaque page reviendrait
  // indefiniment et la synchronisation tournerait en rond.
  const reseau = fauxReseau(() => reponse([
    { id: "c1", name: "A", version: 1, updated_at: "2026-09-03T08:00:00Z" },
    { id: "c2", name: "B", version: 1, updated_at: "2026-09-03T08:00:00Z" }
  ]));
  try {
    const page = await adaptateur().pullChanges({
      cursor: { classes: { updatedAt: "2026-09-03T08:00:00Z", id: "c1" } }
    });
    assertEgal(page.records.map(r => r.id), ["c2"], "seule la suivante");
  } finally { reseau.rendre(); }
});

test("il reste des pages quand le serveur en rend plus que demande", async () => {
  const lignes = Array.from({ length: 4 }, (_, i) =>
    ({ id: `c${i}`, version: 1, updated_at: `2026-09-03T08:00:0${i}Z` }));
  const reseau = fauxReseau(() => reponse(lignes));
  try {
    const page = await adaptateur().pullChanges({ limit: 3 });
    assert(page.hasMore, "il doit rester des pages");
    assertEgal(page.records.length, 3, "sans rendre la ligne temoin");
  } finally { reseau.rendre(); }
});

test("l'envoi porte la version sur laquelle il s'appuie", async () => {
  const reseau = fauxReseau(() => reponse([{ id: "c1", version: 5, updated_at: "2026-09-03T09:00:00Z" }]));
  try {
    const resultat = await adaptateur().pushOperation({
      entity: "classes", id: "c1", action: "upsert", baseVersion: 4, data: { name: "6e2" }
    });
    const [appel] = reseau.appels;
    assertEgal(appel.method, "PATCH", "une modification ciblee");
    assertEgal(appel.body.version, 4, "la version de depart doit accompagner l'envoi");
    assertEgal(resultat.status, "ok", "accepte");
    assertEgal(resultat.record.version, 5, "la nouvelle version revient");
  } finally { reseau.rendre(); }
});

test("une version perimee devient un conflit, pas une panne", async () => {
  // C'est le cas qui compte : traduit en erreur, le moteur reprendrait sans fin ; traduit en
  // conflit, il pose la question au professeur.
  let premier = true;
  const reseau = fauxReseau(({ options }) => {
    if (options.method === "PATCH") {
      premier = false;
      return new Response("Version perimee : la ligne a ete modifiee ailleurs", { status: 400 });
    }
    return reponse([{ id: "c1", name: "6e9", version: 7, updated_at: "2026-09-03T10:00:00Z", user_id: "collegue" }]);
  });
  try {
    const resultat = await adaptateur().pushOperation({
      entity: "classes", id: "c1", action: "upsert", baseVersion: 4, data: { name: "6e2" }
    });
    assertEgal(resultat.status, "conflict", "un conflit, pas une erreur");
    assertEgal(resultat.serverRecord.version, 7, "avec la version du serveur");
    assertEgal(resultat.serverRecord.data.name, "6e9", "et sa valeur, pour trancher");
    assert(!premier, "l'envoi a bien ete tente");
  } finally { reseau.rendre(); }
});

test("une session expiree remonte clairement", async () => {
  const reseau = fauxReseau(() => new Response("", { status: 401 }));
  try {
    await assertRejette(() => adaptateur().pullChanges({}), "un 401 doit lever");
  } finally { reseau.rendre(); }
});

test("une suppression est envoyee comme telle", async () => {
  const reseau = fauxReseau(() => reponse([{ id: "c1", version: 6, updated_at: "2026-09-03T09:00:00Z", deleted: true }]));
  try {
    const resultat = await adaptateur().pushOperation({
      entity: "classes", id: "c1", action: "delete", baseVersion: 5, data: null
    });
    assertEgal(reseau.appels[0].body.deleted, true, "la suppression est une modification");
    assertEgal(resultat.record.deleted, true, "et revient marquee");
  } finally { reseau.rendre(); }
});

test("les champs vides ne sont pas envoyes", async () => {
  const reseau = fauxReseau(() => reponse([{ id: "c1", version: 2, updated_at: "2026-09-03T09:00:00Z" }]));
  try {
    await adaptateur().pushOperation({ entity: "classes", id: "c1", action: "upsert", baseVersion: 0, data: { name: "6e1" } });
    assert(!("version" in reseau.appels[0].body), "sans version connue, on n'en invente pas");
  } finally { reseau.rendre(); }
});

test("une ligne inconnue du serveur est inseree, pas modifiee", async () => {
  // Le piege : un PATCH sur une ligne inexistante ne touche personne et repond 200 avec une liste
  // vide. La saisie sortirait de la file en paraissant envoyee, et serait perdue sans un mot.
  const reseau = fauxReseau(() => reponse([{ id: "c1", name: "6e1", version: 1, updated_at: "2026-09-03T09:00:00Z" }]));
  try {
    const resultat = await adaptateur().pushOperation({
      entity: "classes", id: "c1", action: "upsert", baseVersion: 0, data: { name: "6e1" }
    });
    const [appel] = reseau.appels;
    assertEgal(appel.method, "POST", "une creation");
    assert(!appel.url.includes("id=eq."), "sur la table, pas sur une ligne");
    assertEgal(resultat.status, "ok", "acceptee");
    assertEgal(resultat.record.version, 1, "avec sa premiere version");
  } finally { reseau.rendre(); }
});

test("une suppression reste une modification ciblee", async () => {
  const reseau = fauxReseau(() => reponse([{ id: "c1", version: 6, updated_at: "2026-09-03T09:00:00Z", deleted: true }]));
  try {
    await adaptateur().pushOperation({ entity: "classes", id: "c1", action: "delete", baseVersion: 0, data: null });
    assertEgal(reseau.appels[0].method, "PATCH", "on n'insere jamais une suppression");
  } finally { reseau.rendre(); }
});

test("un droit refuse n'est pas une panne a rejouer", async () => {
  // C'est le cas qui compte pour les eleves : un professeur non administrateur qui ajoute une
  // fiche. Traite comme une erreur, l'operation reviendrait indefiniment dans la file.
  const reseau = fauxReseau(({ options }) =>
    options.method === "POST" || options.method === "PATCH"
      ? new Response('{"message":"new row violates row-level security policy"}', { status: 403 })
      : reponse([{ id: "c1", name: "6e1", version: 3, updated_at: "2026-09-03T10:00:00Z" }]));
  try {
    const resultat = await adaptateur().pushOperation({
      entity: "classes", id: "c1", action: "upsert", baseVersion: 2, data: { name: "6e2" }
    });
    assertEgal(resultat.status, "rejected", "un refus definitif");
    assert(/droits/i.test(resultat.reason), "avec sa raison");
    assertEgal(resultat.serverRecord.version, 3, "et la version qui fait foi");
  } finally { reseau.rendre(); }
});

test("une modification qui ne touche aucune ligne n'est pas un succes", async () => {
  // PostgREST repond 200 avec une liste vide quand les regles de securite rendent la ligne
  // invisible. L'acquitter comme un envoi reussi faisait disparaitre la saisie sans un mot.
  const reseau = fauxReseau(({ options }) =>
    options.method === "PATCH" ? reponse([]) : reponse([]));
  try {
    const resultat = await adaptateur().pushOperation({
      entity: "classes", id: "c1", action: "upsert", baseVersion: 4, data: { name: "6e2" }
    });
    assertEgal(resultat.status, "rejected", "pas un succes");
    assertEgal(resultat.serverRecord, null, "et rien a restaurer");
  } finally { reseau.rendre(); }
});

test("un refus sans ligne lisible reste un refus", async () => {
  const reseau = fauxReseau(({ options }) =>
    options.method === "POST" ? new Response("", { status: 403 }) : new Response("", { status: 401 }));
  try {
    const resultat = await adaptateur().pushOperation({
      entity: "classes", id: "c1", action: "upsert", baseVersion: 0, data: { name: "6e1" }
    });
    assertEgal(resultat.status, "rejected", "le refus prime sur la lecture ratee");
    assertEgal(resultat.serverRecord, null, "sans version de reference");
  } finally { reseau.rendre(); }
});

test("une table ne se fait pas entrainer par le curseur d'une autre", async () => {
  // Le defaut d'origine : un curseur unique avancait jusqu'a la ligne la plus recente toutes
  // tables confondues. La table dont les lignes etaient plus anciennes se retrouvait sautee, et
  // les creneaux d'une partie des collegues disparaissaient du planning partage.
  const demandes = [];
  const reseau = fauxReseau(({ url }) => {
    demandes.push(String(url));
    return /eleves/.test(url)
      ? reponse([{ id: "e1", version: 1, updated_at: "2026-01-01T08:00:00Z" }])
      : reponse([{ id: "c1", version: 1, updated_at: "2026-09-03T08:00:00Z" }]);
  });
  try {
    const deux = createSupabaseAdapter({ url: URL_FICTIVE, anonKey: "cle", session, tables: ["eleves", "classes"] });
    const page = await deux.pullChanges({});
    assertEgal(page.cursor.eleves.updatedAt, "2026-01-01T08:00:00Z", "l'eleve garde sa date");
    assertEgal(page.cursor.classes.updatedAt, "2026-09-03T08:00:00Z", "la classe la sienne");

    const suite = await deux.pullChanges({ cursor: page.cursor });
    const depuisEleves = demandes.filter(u => /eleves/.test(u)).pop();
    assert(depuisEleves.includes("2026-01-01"), "la seconde lecture des eleves repart de leur propre date");
  } finally { reseau.rendre(); }
});

/**
 * Un import en masse ecrit toutes ses lignes au meme instant : dans une transaction Postgres,
 * now() ne bouge pas. Un repertoire d'un millier d'eleves importe d'un coup, ce sont mille lignes
 * portant la meme date. Tant que la pagination ne tenait qu'a cette date, le repere n'avancait
 * plus des qu'une page etait pleine de lignes simultanees, et le serveur renvoyait indefiniment
 * les memes : la synchronisation tournait sans fin, l'entete restait sur "Synchronisation..." et
 * les rubriques sur "Chargement", sans le moindre message.
 */
test("des lignes ecrites au meme instant ne bloquent pas la lecture", async () => {
  const MEME_INSTANT = "2026-09-01T10:00:00+00:00";
  const base = ["a", "b", "c", "d", "e"].map(id => ({ id, updated_at: MEME_INSTANT, version: 1 }));

  // Faux serveur fidele sur le seul point qui compte : il n'applique que le filtre demande.
  const reseau = fauxReseau(({ url }) => {
    const apres = decodeURIComponent(url).match(/id\.gt\."([^"]+)"/);
    const limite = Number(decodeURIComponent(url).match(/limit=(\d+)/)[1]);
    const restantes = apres ? base.filter(l => l.id > apres[1]) : base;
    return reponse(restantes.slice(0, limite));
  });

  try {
    const adapt = adaptateur();
    const vues = [];
    let curseur;
    let tours = 0;
    for (let encore = true; encore && tours < 10; tours++) {
      const page = await adapt.pullChanges({ cursor: curseur, limit: 2 });
      page.records.forEach(r => vues.push(r.id));
      curseur = page.cursor;
      encore = page.hasMore;
    }
    assert(tours < 10, "la lecture doit se terminer, pas tourner en rond");
    assertEgal(vues.join(","), "a,b,c,d,e", "et rapporter chaque ligne une seule fois");
  } finally { reseau.rendre(); }
});
