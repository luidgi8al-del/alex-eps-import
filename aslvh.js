/*
 * Onglet ASLVH : licencies, creneaux, groupes, appels et statistiques.
 *
 * Sorti d'index.html. Script classique, comme les dix autres fichiers du site :
 * les fonctions restent accessibles depuis les autres fichiers sans rien exporter,
 * et ce fichier est charge avant le script principal qui s'en sert.
 */

// ---- Onglet UNSS : repertoire "Eleve LVH" (general) / "Licencies AS" (categorie, voeux,
// taille maillot). Prive au compte (pas de partage entre collegues, contrairement a
// Planning/Programmation) : synchronise juste avec l'app via le meme compte.
const UNSS_CATEGORIES = [
  { value: "BENJAMIN", label: "Benjamin" }, { value: "MINIME", label: "Minime" },
  { value: "CADET", label: "Cadet" }, { value: "JUNIOR", label: "Junior" }
];

function computeUnssCategory(birthDateEpochMillis, schoolYear) {
  if (!birthDateEpochMillis) return "MINIME";
  const birthYear = new Date(birthDateEpochMillis).getFullYear();
  const startYear = parseInt(String(schoolYear || "").slice(0, 4), 10) || new Date().getFullYear();
  const age = startYear - birthYear;
  if (age <= 12) return "BENJAMIN";
  if (age <= 14) return "MINIME";
  if (age <= 16) return "CADET";
  return "JUNIOR";
}
/**
 * Les categories UNSS se declinent au masculin et au feminin, et les competitions sont
 * separees : "Minime Fille" n'est pas la meme categorie que "Minime Garcon". Le sexe n'est
 * pas toujours renseigne (saisie manuelle, ancien import), on retombe alors sur la forme
 * epicene plutot que d'imposer le masculin.
 */
const UNSS_CATEGORY_LABELS = {
  BENJAMIN: { M: "Benjamin", F: "Benjamine", "": "Benjamin(e)" },
  MINIME:   { M: "Minime Garcon", F: "Minime Fille", "": "Minime" },
  CADET:    { M: "Cadet", F: "Cadette", "": "Cadet(te)" },
  JUNIOR:   { M: "Junior", F: "Juniore", "": "Junior(e)" }
};
function unssCategoryLabel(value, sex) {
  const formes = UNSS_CATEGORY_LABELS[value];
  if (!formes) return (UNSS_CATEGORIES.find(c => c.value === value) || {}).label || value;
  return formes[sex === "M" || sex === "F" ? sex : ""];
}

/** "Masculin", "M", "Garcon", "H" -> M ; "Feminin", "F", "Fille" -> F ; sinon inconnu. */
function normalizeSex(value) {
  const v = String(value || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!v) return "";
  if (v.startsWith("m") || v.startsWith("g") || v.startsWith("h")) return "M";
  if (v.startsWith("f")) return "F";
  return "";
}

function parseFrDate(value) {
  const m = (value || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  return isNaN(d.getTime()) ? null : d.getTime();
}
function formatFrDate(epochMillis) {
  if (!epochMillis) return "";
  const d = new Date(epochMillis);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// "all" ne s'atteint plus depuis ASLVH : le repertoire complet vit dans Classe > Liste eleve.
let unssMode = "licensed"; // "all" | "licensed" | "slots" | "groups" | "appel"
let unssStudents = [];
let unssGroups = [];
let unssAppelGroupId = null;
let unssAppelMembers = [];
let unssAppelPresence = {};
/** Dispenses en cours, rangees par eleve, pour prevenir a l'appel AS. */
let unssAppelDispenses = new Map();

/**
 * Le repertoire AS et les eleves de classe sont deux tables sans lien : la dispense est posee
 * sur l'eleve de classe, l'appel se fait sur le membre AS. On les rapproche par nom, prenom et
 * date de naissance - la meme cle que le versement d'une division dans une classe.
 */
function cleEleve(nom, prenom, naissance) {
  return [String(nom || "").trim().toLowerCase(),
          String(prenom || "").trim().toLowerCase(),
          naissance == null || naissance === "" ? "" : String(naissance)].join("|");
}

/** Les dispenses qui couvrent la date du jour, rangees par cle d'eleve. */
function dispensesDuJour(dispenses, elevesDeClasse, jour) {
  const parId = new Map();
  elevesDeClasse.forEach(e => parId.set(e.id, e));
  const index = new Map();
  dispenses.forEach(d => {
    if (d.deleted) return;
    if (!(d.start_date <= jour && d.end_date >= jour)) return;
    const eleve = parId.get(d.student_id);
    if (!eleve) return;
    index.set(cleEleve(eleve.last_name, eleve.first_name, eleve.birth_date_epoch_millis), d);
  });
  return index;
}
// `var` est volontaire ici : initUnssTab est appelable dès le premier affichage de la page.
// Une déclaration `let` placée plus bas provoquait une zone morte temporelle lorsque l'onglet
// ASLVH était restauré ou cliqué pendant l'initialisation asynchrone.
var unssTabReady = false;

async function initUnssTab() {
  // Le repertoire s'affiche dans deux conteneurs : "Liste eleve" sous Classe et "Licencies AS"
  // ici. Ouvrir cet onglet apres avoir consulte la liste sous Classe laissait la cible sur
  // l'autre conteneur, masque : l'ecran restait vide sans la moindre explication. On la remet en
  // place avant toute verification, sinon meme un message d'erreur atterrirait au mauvais endroit.
  unssCibleRendu = "unssList";
  viderAutreRendu("unssList");
  const asSchema = await apiFetch(`${SUPABASE_URL}/rest/v1/rpc/eps_as_roster_version`);
  if (!asSchema.ok || await asSchema.json() !== 2) {
    document.getElementById("unssList").textContent="Mise à jour AS nécessaire : exécutez schema_as_roster.sql dans Supabase avant de gérer les groupes et appels.";
    return;
  }
  if (!unssTabReady) {
    document.getElementById("unssSubtabs").addEventListener("click", (e) => {
      const btn = e.target.closest(".subtabbtn");
      if (btn) showUnssTab(btn.dataset.unsstab);
    });
    unssTabReady = true;
  }
  await loadUnssStudents();
  await loadUnssGroups();
  await loadUnssSlots();
  renderUnssTab();
}

async function showUnssTab(mode) {
  unssMode = mode;
  unssCibleRendu = "unssList";
  viderAutreRendu("unssList");
  unssAdmin = await estAdministrateur();
  // Changer de liste change son contenu : rester en page 7 n'aurait aucun sens.
  unssPage = 1;
  document.querySelectorAll("#unssSubtabs .subtabbtn").forEach(b => b.classList.toggle("active", b.dataset.unsstab === mode));
  fermerFenetreUnss();
  renderUnssTab();
}

async function loadUnssStudents() {
  if (tableSuivie("unss_students")) {
    const lecture = await modeHorsConnexion.lire("unss_students", {
      trier: (a, b) => String(a.last_name || "").localeCompare(String(b.last_name || ""))
        || String(a.first_name || "").localeCompare(String(b.first_name || ""))
    });
    unssStudents = lecture.rows;
    return;
  }
  // Lecture paginee : le repertoire d'un etablissement depasse le millier de lignes, et
  // PostgREST plafonne ce qu'il rend par requete.
  const res = await apiFetchAll(`${SUPABASE_URL}/rest/v1/unss_students?deleted=eq.false&select=*&order=last_name.asc,first_name.asc`);
  unssStudents = res.ok ? res.rows : [];
}

let unssSlots = [];

/**
 * Creneaux AS : l'offre d'activites de l'association sportive, parmi laquelle l'eleve
 * formule ses trois voeux. Distincte des groupes, qui sont les listes d'eleves reellement
 * inscrits une fois les voeux traites.
 */
async function loadUnssSlots() {
  unssSlots = await lireTable("unss_slots", "unss_slots?deleted=eq.false&select=*&order=activity_name.asc",
    { trier: (a, b) => String(a.activity_name || "").localeCompare(String(b.activity_name || "")) });
}

const UNSS_SLOT_DAYS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];

/**
 * Menu deroulant des creneaux AS pour un voeu. [ancienLibelle] couvre les voeux saisis en
 * texte libre avant ce module : plutot que de les perdre silencieusement, on les propose en
 * tete de liste, signales comme ne correspondant a aucun creneau existant.
 */
function menuCreneaux(id, slotIdChoisi, ancienLibelle) {
  const orphelin = !slotIdChoisi && ancienLibelle
    ? `<option value="" selected>${unssText(ancienLibelle)} (ancien voeu, hors creneaux)</option>`
    : "";
  const vide = `<option value=""${!slotIdChoisi && !ancienLibelle ? " selected" : ""}>Aucun voeu</option>`;
  const options = unssSlots.map(slot =>
    `<option value="${slot.id}"${slot.id === slotIdChoisi ? " selected" : ""}>${unssText(unssSlotLabel(slot))}</option>`
  ).join("");
  if (unssSlots.length === 0) {
    // Sans value="", un <option> renvoie son texte : la phrase partait telle quelle dans
    // wish1_slot_id, et le serveur refusait la ligne entiere sans qu'on comprenne pourquoi.
    return `<select id="${id}" disabled><option value="">Aucun creneau AS. Creez-en dans l'onglet Creneaux AS.</option></select>`;
  }
  return `<select id="${id}">${orphelin}${vide}${options}</select>`;
}

/** Les intitules de creneau sont saisis a la main : ils repassent par un echappement HTML. */
function unssText(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function unssSlotLabel(slot) {
  if (!slot) return "";
  const horaire = [slot.start_time, slot.end_time].filter(Boolean).join("-");
  return [slot.activity_name, capitaliseJour(slot.day_of_week), horaire, slot.location]
    .filter(Boolean).join(" · ");
}

function capitaliseJour(jour) {
  if (!jour) return "";
  return jour.charAt(0) + jour.slice(1).toLowerCase();
}

async function loadUnssGroups() {
  unssGroups = await lireTable("unss_groups",
    "unss_groups?deleted=eq.false&active=eq.true&select=*&order=activity_name.asc",
    { ou: g => g.active !== false,
      trier: (a, b) => String(a.activity_name || "").localeCompare(String(b.activity_name || "")) });
}

/**
 * Decoupe une longue liste en pages numerotees.
 *
 * Mille quatre cents eleves affiches d'un bloc, c'est une page interminable ou l'on ne retrouve
 * rien. On en montre cent a la fois.
 */
const TAILLE_PAGE_LISTE = 100;

/**
 * Boutons de navigation : les premieres et dernieres pages restent toujours accessibles, et une
 * fenetre suit la page courante. Au-dela d'une dizaine de pages, tout afficher ferait une ligne
 * de chiffres illisible.
 */
function paginationHtml(page, total, nom) {
  if (total <= 1) return "";
  const numeros = new Set([1, total]);
  for (let n = page - 2; n <= page + 2; n++) if (n >= 1 && n <= total) numeros.add(n);
  const tries = [...numeros].sort((a, b) => a - b);

  let html = `<div class="pagination">`;
  html += `<button class="secondary" data-${nom}-page="${page - 1}" ${page === 1 ? "disabled" : ""}>Precedent</button>`;
  let precedent = 0;
  tries.forEach(n => {
    if (n - precedent > 1) html += `<span class="paginationEcart">…</span>`;
    html += `<button class="${n === page ? "" : "secondary"}" data-${nom}-page="${n}">${n}</button>`;
    precedent = n;
  });
  html += `<button class="secondary" data-${nom}-page="${page + 1}" ${page === total ? "disabled" : ""}>Suivant</button>`;
  return html + `</div>`;
}

/** Rend cliquables les boutons produits par paginationHtml. */
function wirePagination(wrap, nom, onPage) {
  wrap.querySelectorAll(`[data-${nom}-page]`).forEach(btn => {
    btn.addEventListener("click", () => {
      const cible = parseInt(btn.dataset[nom + "Page"], 10);
      if (!isNaN(cible)) onPage(cible);
    });
  });
}

/**
 * Verse les eleves coches dans une classe.
 *
 * C'est une recopie, pas un deplacement : une classe garde ses propres eleves, ou vivent le
 * niveau EPS, les evaluations et les dispenses. Le repertoire reste la source, la classe en
 * prend une copie de travail.
 *
 * Les eleves deja presents dans la classe sont laisses de cote plutot que dupliques : on
 * reconnait un eleve a son nom, son prenom et sa date de naissance, les trois seuls champs
 * fiables a ce stade.
 */
/**
 * Fenetre de choix de la classe, creee une fois et reutilisee.
 *
 * Le choix passait par un prompt() du navigateur : il ne sait afficher que du texte, donc les
 * classes y etaient numerotees et il fallait taper un chiffre. On clique desormais la classe.
 */
function fenetreChoixClasse() {
  let voile = document.getElementById("classPickOverlay");
  if (voile) return voile;
  voile = document.createElement("div");
  voile.className = "searchOverlay";
  voile.id = "classPickOverlay";
  voile.innerHTML = `<div class="searchSheet">
    <div class="top" style="margin-bottom:6px"><h2 style="margin:0" id="classPickTitre">Ajouter a une classe</h2>
      <button class="secondary" id="classPickClose" style="margin-top:0">Fermer</button></div>
    <div id="classPickBody"></div></div>`;
  document.body.appendChild(voile);
  voile.querySelector("#classPickClose").addEventListener("click", () => fermerFenetreChoixClasse());
  voile.addEventListener("click", e => { if (e.target === voile) fermerFenetreChoixClasse(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && voile.classList.contains("open")) fermerFenetreChoixClasse();
  });
  return voile;
}

function fermerFenetreChoixClasse() {
  const voile = document.getElementById("classPickOverlay");
  if (!voile) return;
  // Un bouton encore focalise garderait le clavier dans une fenetre invisible.
  if (voile.contains(document.activeElement)) document.activeElement.blur();
  voile.classList.remove("open");
}

async function ouvrirChoixClassePourEleves() {
  if (selectionEleves.size === 0) return;
  const voile = fenetreChoixClasse();
  const corps = voile.querySelector("#classPickBody");
  voile.querySelector("#classPickTitre").textContent =
    `Ajouter ${selectionEleves.size} eleve(s) a une classe`;
  corps.innerHTML = `<div class="muted">Chargement de vos classes...</div>`;
  voile.classList.add("open");

  const res = await apiFetchAll(`${SUPABASE_URL}/rest/v1/classes?deleted=eq.false&select=id,name,grade,class_number&order=name.asc`);
  if (!res.ok) { corps.innerHTML = `<div class="error">Impossible de lire vos classes.</div>`; return; }
  const classes = res.rows;
  if (classes.length === 0) {
    corps.innerHTML = `<div class="muted">Aucune classe. Creez-en une d'abord dans Creation classe.</div>`;
    return;
  }
  corps.innerHTML = `<div class="muted" style="margin-bottom:8px">Cliquez la classe qui doit les recevoir.</div>`
    + `<div style="display:flex; flex-direction:column; gap:6px">`
    + classes.map(c => `<button class="secondary" data-classe="${planningText(c.id)}"
        style="margin-top:0; text-align:left">${planningText(c.name)}</button>`).join("")
    + `</div>`;
  corps.querySelectorAll("[data-classe]").forEach(btn => btn.addEventListener("click", () => {
    const classe = classes.find(c => c.id === btn.dataset.classe);
    // Deux clics de suite verseraient deux fois : on ferme la liste des l'appui.
    corps.querySelectorAll("[data-classe]").forEach(b => { b.disabled = true; });
    if (classe) verserDansClasse(classe, corps);
  }));
}

/** Verse les eleves coches dans la classe choisie, en laissant de cote ceux qui y sont deja. */
async function verserDansClasse(classe, corps) {
  const echec = message => { corps.innerHTML = `<div class="error">${planningText(message)}</div>`; };
  corps.innerHTML = `<div class="muted">Ajout en cours dans ${planningText(classe.name)}...</div>`;

  const existantsRes = await apiFetchAll(
    `${SUPABASE_URL}/rest/v1/students?deleted=eq.false&class_id=eq.${classe.id}&select=last_name,first_name,birth_date_epoch_millis`);
  if (!existantsRes.ok) { echec("Impossible de lire les eleves de cette classe. Rien n'a ete ajoute."); return; }
  const cle = e => [ (e.last_name || "").trim().toLowerCase(),
                     (e.first_name || "").trim().toLowerCase(),
                     e.birth_date_epoch_millis || "" ].join("|");
  const deja = new Set(existantsRes.rows.map(cle));

  const maintenant = new Date().toISOString();
  const aVerser = unssStudents.filter(e => selectionEleves.has(e.id) && !deja.has(cle(e)));
  const ignores = selectionEleves.size - aVerser.length;
  if (aVerser.length === 0) {
    corps.innerHTML = `<div class="muted">Ces ${ignores} eleve(s) sont deja dans `
      + `${planningText(classe.name)}. Rien n'a ete ajoute.</div>`;
    return;
  }

  const creation = await apiFetch(`${SUPABASE_URL}/rest/v1/students`, {
    method: "POST",
    body: JSON.stringify(aVerser.map(e => ({
      id: crypto.randomUUID(), class_id: classe.id, user_id: session.user_id,
      last_name: e.last_name, first_name: e.first_name,
      // Les deux tables n'encodent pas le sexe pareil : le repertoire AS dit "M" ou "F", les
      // eleves de classe disent "GARCON" ou "FILLE". Recopier tel quel produisait une valeur
      // qu'aucune option de la liste ne reconnait - et le navigateur affichait alors la
      // premiere, "FILLE", pour tout le monde.
      sex: sexFromValue(e.sex) || "NON_PRECISE",
      birth_date_epoch_millis: e.birth_date_epoch_millis || null,
      student_email: e.student_email || null, parent1_email: e.parent_email || null,
      updated_at: maintenant, deleted: false
    })))
  });
  if (!creation.ok) { echec("Ajout non confirme. Rien n'a ete ajoute."); return; }
  // Versement en lot direct, mais l'onglet Classe lit la copie locale : sans cette
  // synchronisation, les eleves verses n'y apparaitraient qu'a la prochaine occasion.
  try { await modeHorsConnexion?.synchroniser(); } catch { /* la lecture suivante reessaiera */ }

  selectionEleves.clear();
  renderUnssTab();
  corps.innerHTML = `<div><strong>${aVerser.length} eleve(s) ajoute(s) a `
    + `${planningText(classe.name)}.</strong></div>`
    + (ignores > 0 ? `<div class="muted">${ignores} deja present(s), laisse(s) de cote.</div>` : "")
    + `<button id="classPickFini" style="margin-top:10px">Fermer</button>`;
  corps.querySelector("#classPickFini").addEventListener("click", () => fermerFenetreChoixClasse());
}
/**
 * Colonnes de la Liste eleve, dans un ordre fixe.
 *
 * Un tableau plutot que des fiches : on vient y chercher tous les eleves d'une meme division,
 * et comparer une colonne suppose qu'elle soit toujours au meme endroit.
 */
const COLONNES_ELEVE = [
  { cle: "last_name", titre: "Nom", valeur: e => e.last_name || "" },
  { cle: "first_name", titre: "Prenom", valeur: e => e.first_name || "" },
  { cle: "birth", titre: "Naissance", valeur: e => e.birth_date_epoch_millis || 0,
    texte: e => formatFrDate(e.birth_date_epoch_millis) },
  { cle: "division", titre: "Division", valeur: e => e.division || "" },
  { cle: "sex", titre: "Sexe", valeur: e => e.sex || "",
    texte: e => ({ M: "Garcon", F: "Fille" })[e.sex] || "" },
  { cle: "student_email", titre: "Mail eleve", valeur: e => e.student_email || "" },
  { cle: "parent_email", titre: "Mail parent", valeur: e => e.parent_email || "" }
];

/** Colonne triee et sens du tri. La division en premier : c'est par elle qu'on regroupe. */
let triEleve = { cle: "division", croissant: true };
/** Eleves coches, conserves d'une page a l'autre : une selection ne doit pas s'evaporer. */
let selectionEleves = new Set();
/** Division affichee seule, "" pour toutes. Verser une classe entiere passe par la. */
let divisionFiltre = "";

/** Divisions presentes au repertoire, avec leur effectif, dans l'ordre ou on les lit. */
function divisionsConnues(eleves) {
  const compte = new Map();
  eleves.forEach(e => {
    const d = (e.division || "").trim();
    if (d) compte.set(d, (compte.get(d) || 0) + 1);
  });
  return [...compte.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "fr", { numeric: true, sensitivity: "base" }))
    .map(([nom, effectif]) => ({ nom, effectif }));
}

/** Eleves d'une division, quelle que soit la page affichee. */
function elevesDeLaDivision(eleves, division) {
  return eleves.filter(e => (e.division || "").trim() === division);
}

function trierEleves(eleves) {
  const colonne = COLONNES_ELEVE.find(c => c.cle === triEleve.cle) || COLONNES_ELEVE[0];
  const sens = triEleve.croissant ? 1 : -1;
  return [...eleves].sort((a, b) => {
    const va = colonne.valeur(a), vb = colonne.valeur(b);
    // Une division vide se range apres les autres, quel que soit le sens : elle n'est pas
    // une division "petite", c'est une information manquante.
    if (typeof va === "string" && typeof vb === "string") {
      if (!va && vb) return 1;
      if (va && !vb) return -1;
      const c = va.localeCompare(vb, "fr", { numeric: true, sensitivity: "base" });
      if (c !== 0) return c * sens;
    } else if (va !== vb) {
      return (va < vb ? -1 : 1) * sens;
    }
    // A valeur egale, l'ordre alphabetique evite qu'une ligne saute d'une page a l'autre.
    return (a.last_name || "").localeCompare(b.last_name || "", "fr")
      || (a.first_name || "").localeCompare(b.first_name || "", "fr");
  });
}

function tableauElevesHtml(eleves) {
  let html = `<div style="overflow-x:auto"><table class="eleveTable"><thead><tr>`;
  html += `<th class="eleveCoche"><input type="checkbox" id="cocheToutesPages"></th>`;
  COLONNES_ELEVE.forEach(c => {
    const actif = triEleve.cle === c.cle;
    html += `<th><button type="button" class="eleveTri${actif ? " actif" : ""}" data-tri="${c.cle}">`
      + `${planningText(c.titre)}${actif ? (triEleve.croissant ? " \u25B2" : " \u25BC") : ""}</button></th>`;
  });
  html += `</tr></thead><tbody>`;
  eleves.forEach(e => {
    html += `<tr data-eleve="${e.id}"${selectionEleves.has(e.id) ? ' class="choisi"' : ""}>`
      + `<td class="eleveCoche"><input type="checkbox" data-coche="${e.id}"${selectionEleves.has(e.id) ? " checked" : ""}></td>`
      + COLONNES_ELEVE.map(c => `<td>${planningText(c.texte ? c.texte(e) : c.valeur(e))}</td>`).join("")
      + `</tr>`;
  });
  return html + `</tbody></table></div>`;
}

/** Page affichee du repertoire. Repart a la premiere des que la liste change de nature. */
let unssPage = 1;
/** Connu avant le rendu : le tableau se construit d'un bloc, il ne peut pas attendre. */
let unssAdmin = false;

function renderUnssTab() {
  if (unssMode === "slots") { renderUnssSlotsTab(); return; }
  if (unssMode === "groups") { renderUnssGroupsTab(); return; }
  if (unssMode === "appel") { renderUnssAppelTab(); return; }
  const wrap = document.getElementById(unssCibleRendu);
  if (!wrap) return;
  // Liste eleve se lit en tableau : on y cherche une division entiere, pas une fiche.
  // Licencies AS garde ses cartes, ou l'on consulte les voeux et la taille de maillot.
  const enTableau = unssCibleRendu === "listeEleveList";
  const brut = unssMode === "licensed" ? unssStudents.filter(s => s.licensed) : unssStudents;
  // Le filtre par division n'a de sens que sur le tableau : c'est la qu'on vient chercher une
  // classe entiere. Une division disparue du repertoire ne doit pas laisser un tableau vide.
  const divisions = enTableau ? divisionsConnues(brut) : [];
  if (divisionFiltre && !divisions.some(d => d.nom === divisionFiltre)) divisionFiltre = "";
  const filtres = enTableau && divisionFiltre ? elevesDeLaDivision(brut, divisionFiltre) : brut;
  const rows = enTableau ? trierEleves(filtres) : filtres;
  const totalPages = Math.max(1, Math.ceil(rows.length / TAILLE_PAGE_LISTE));
  // Supprimer des eleves peut faire disparaitre la page courante sous les pieds.
  if (unssPage > totalPages) unssPage = totalPages;
  const debutPage = (unssPage - 1) * TAILLE_PAGE_LISTE;
  const rowsPage = rows.slice(debutPage, debutPage + TAILLE_PAGE_LISTE);
  let html = "";
  // Verser une classe entiere : on choisit sa division, puis on coche tout d'un geste. Sans
  // cela il fallait cliquer les eleves un par un, et une page de cent en melange plusieurs.
  if (enTableau && divisions.length) {
    const tousChoisis = rows.length > 0 && rows.every(e => selectionEleves.has(e.id));
    html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap">
      <label for="filtreDivision">Division</label>
      <select id="filtreDivision" style="margin-top:0; width:auto">
        <option value="">Toutes les divisions</option>
        ${divisions.map(d => `<option value="${planningText(d.nom)}"${d.nom === divisionFiltre ? " selected" : ""}>`
          + `${planningText(d.nom)} (${d.effectif})</option>`).join("")}
      </select>`;
    if (divisionFiltre) {
      html += `<button class="secondary" id="cocherDivision" style="margin-top:0">`
        + `${tousChoisis ? "Decocher" : "Cocher"} toute la division ${planningText(divisionFiltre)}`
        + ` (${rows.length})</button>`;
    }
    if (selectionEleves.size) {
      html += `<button class="secondary" id="viderSelection" style="margin-top:0">`
        + `Vider la selection (${selectionEleves.size})</button>`;
    }
    html += `</div>`;
  }
  html += `<div style="display:flex; justify-content:flex-end; gap:8px; margin-bottom:10px">`;
  // Importer, ajouter et supprimer sont reserves a l'administrateur : ces actions touchent le
  // repertoire de tout l'etablissement. Corriger une fiche reste ouvert a chacun.
  if (unssAdmin) {
    html += `<button class="secondary" id="unssImportBtn" style="margin-top:0">Importer CSV</button>`;
  }
  // Vider le repertoire n'a de sens que sur la liste complete : depuis Licencies AS on ne
  // verrait pas ce qu'on supprime, puisque les licencies sont justement ce qui est preserve.
  if (unssAdmin && unssMode !== "licensed" && rows.length > 0) {
    html += `<button class="secondary" id="unssClearBtn" style="margin-top:0">Supprimer toute la liste</button>`;
  }
  // Licencier un eleve ne cree personne : cela coche un eleve deja present, et reste ouvert.
  if (unssAdmin || unssMode === "licensed") {
    html += `<button id="unssAddBtn" style="margin-top:0">${unssMode === "licensed" ? "Licencier un eleve" : "Ajouter"}</button>`;
  }
  // Verser une selection dans une classe : c'est le geste que le tableau doit rendre facile.
  if (unssCibleRendu === "listeEleveList") {
    html += `<button id="eleveVersClasseBtn" style="margin-top:0" ${selectionEleves.size ? "" : "disabled"}>`
      + `Ajouter a une classe${selectionEleves.size ? ` (${selectionEleves.size})` : ""}</button>`;
  }
  html += `</div>`;

  if (rows.length === 0) {
    html += `<div class="muted">${unssMode === "licensed" ? "Aucun licencie AS. Cliquez sur \"Licencier un eleve\" pour cocher un eleve de Classe > Liste eleve." : "Aucun eleve dans le repertoire. Ajoutez-en un ou importez un CSV (nom, prenom, date de naissance)."}</div>`;
  } else {
    html += `<div class="muted" style="margin-bottom:8px">`
      + `${debutPage + 1}\u2013${debutPage + rowsPage.length} sur ${rows.length} eleve(s)`
      + (enTableau && selectionEleves.size ? ` \u00b7 ${selectionEleves.size} selectionne(s)` : "")
      + `</div>`;
    html += paginationHtml(unssPage, totalPages, "unss");
    if (enTableau) {
      html += tableauElevesHtml(rowsPage);
    } else rowsPage.forEach(s => {
      const wishes = [s.wish1, s.wish2, s.wish3].filter(Boolean).join(", ");
      html += `<div class="card unssCard" data-edit="${s.id}">
        <div>
          <div><strong>${s.last_name} ${s.first_name}</strong></div>
          <div class="muted">${[unssCategoryLabel(s.category, s.sex), formatFrDate(s.birth_date_epoch_millis)].filter(Boolean).join(" · ")}${s.licensed && unssMode === "all" ? " · Licencie AS" : ""}</div>
          ${wishes ? `<div class="muted" style="font-size:12px">Voeux : ${wishes}</div>` : ""}
          ${unssMode === "licensed" && s.jersey_size ? `<div class="muted" style="font-size:12px">Taille maillot : ${s.jersey_size}</div>` : ""}
        </div>
        ${unssAdmin ? `<button class="danger" data-delete="${s.id}" style="margin-top:0">Supprimer</button>` : ""}
      </div>`;
    });
    html += paginationHtml(unssPage, totalPages, "unss");
  }
  wrap.innerHTML = html;
  wrap.querySelectorAll("[data-tri]").forEach(btn => btn.addEventListener("click", () => {
    const cle = btn.dataset.tri;
    // Recliquer la meme colonne inverse le sens ; changer de colonne repart du croissant.
    triEleve = { cle, croissant: triEleve.cle === cle ? !triEleve.croissant : true };
    unssPage = 1;
    renderUnssTab();
  }));
  wrap.querySelectorAll("[data-coche]").forEach(box => box.addEventListener("change", () => {
    if (box.checked) selectionEleves.add(box.dataset.coche); else selectionEleves.delete(box.dataset.coche);
    renderUnssTab();
  }));
  const choixDivision = wrap.querySelector("#filtreDivision");
  if (choixDivision) choixDivision.addEventListener("change", () => {
    // Changer de division ne touche pas aux coches deja posees : on peut composer une classe
    // a partir de deux divisions sans repartir de zero.
    divisionFiltre = choixDivision.value;
    unssPage = 1;
    renderUnssTab();
  });
  const cocherDivision = wrap.querySelector("#cocherDivision");
  if (cocherDivision) cocherDivision.addEventListener("click", () => {
    const dedans = elevesDeLaDivision(unssStudents, divisionFiltre);
    const tousChoisis = dedans.length > 0 && dedans.every(e => selectionEleves.has(e.id));
    dedans.forEach(e => { if (tousChoisis) selectionEleves.delete(e.id); else selectionEleves.add(e.id); });
    renderUnssTab();
  });
  const viderSelection = wrap.querySelector("#viderSelection");
  if (viderSelection) viderSelection.addEventListener("click", () => {
    selectionEleves.clear();
    renderUnssTab();
  });
  const cocheTout = wrap.querySelector("#cocheToutesPages");
  if (cocheTout) cocheTout.addEventListener("change", () => {
    // Ne coche que la page affichee : cocher mille eleves d'un clic invisible serait piegeux.
    wrap.querySelectorAll("[data-coche]").forEach(box => {
      if (cocheTout.checked) selectionEleves.add(box.dataset.coche); else selectionEleves.delete(box.dataset.coche);
    });
    renderUnssTab();
  });
  const versClasse = wrap.querySelector("#eleveVersClasseBtn");
  if (versClasse) versClasse.addEventListener("click", () => ouvrirChoixClassePourEleves());

  wirePagination(wrap, "unss", page => {
    unssPage = page;
    renderUnssTab();
    wrap.scrollIntoView({ block: "start" });
  });

  const addBtn = document.getElementById("unssAddBtn");
  if (addBtn) addBtn.addEventListener("click", () => {
    if (unssMode === "licensed") openUnssPickPanel(); else openUnssStudentPanel(null, false);
  });
  const importBtn = document.getElementById("unssImportBtn");
  if (importBtn) importBtn.addEventListener("click", () => unssFileInput().click());
  const clearBtn = document.getElementById("unssClearBtn");
  if (clearBtn) clearBtn.addEventListener("click", () => viderRepertoireAs());
  wrap.querySelectorAll("[data-edit]").forEach(el => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-delete]")) return;
      const student = unssStudents.find(s => s.id === el.dataset.edit);
      if (student) openUnssStudentPanel(student, student.licensed);
    });
  });
  wrap.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try { await supprimerLigne("unss_students", btn.dataset.delete); }
      catch (erreur) { alert(erreur.message); return; }
      await loadUnssStudents();
      renderUnssTab();
    });
  });
}

/**
 * Les exports de Pronote/SIECLE sortent en Windows-1252, pas en UTF-8. Lus en UTF-8, les
 * octets accentues deviennent U+FFFD : l'entete "Prenom" n'est alors plus reconnu et chaque
 * ligne est rejetee faute de prenom (l'import annonce alors 0 eleve importe).
 * On decode donc en UTF-8, et on retombe sur Windows-1252 des qu'un caractere est invalide.
 */
async function readCsvText(file) {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
}

let unssHiddenFileInput = null;
function unssFileInput() {
  if (unssHiddenFileInput) return unssHiddenFileInput;
  const input = document.createElement("input");
  input.type = "file"; input.accept = ".csv,text/csv"; input.style.display = "none";
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const text = await readCsvText(file);
    await importUnssCsv(text, unssMode === "licensed");
    input.value = "";
  });
  document.body.appendChild(input);
  unssHiddenFileInput = input;
  return input;
}

/**
 * Vide le repertoire Eleve LVH apres un import rate ou un export de l'annee precedente.
 *
 * Deux categories sont preservees, parce que les supprimer detruirait un travail qui ne se
 * refait pas depuis un CSV : les licencies AS (voeux, taille de maillot, emails saisis a la
 * main) et les eleves deja inscrits dans un groupe. Un eleve inscrit mais non licencie
 * viderait sinon la composition du groupe sans que rien ne le signale.
 *
 * La suppression est logique (deleted = true), comme celle d'un eleve isole : une vraie
 * suppression SQL ne se propagerait pas, et l'app republierait ses copies locales a la
 * prochaine synchro. Les lignes disparaissent partout, y compris sur Android.
 */
async function viderRepertoireAs() {
  let inscrits;
  try {
    const adhesions = await lireTable("unss_memberships", "unss_memberships?deleted=eq.false&select=student_id");
    inscrits = new Set(adhesions.map(m => m.student_id));
  } catch { alert("Impossible de verifier les inscriptions aux groupes. Rien n'a ete supprime."); return; }

  const aSupprimer = unssStudents.filter(s => !s.licensed && !inscrits.has(s.id));
  const preserves = unssStudents.length - aSupprimer.length;
  if (aSupprimer.length === 0) {
    alert("Rien a supprimer : tous les eleves du repertoire sont licencies ou inscrits dans un groupe.");
    return;
  }
  if (!confirm(
    `Supprimer ${aSupprimer.length} eleve(s) du repertoire ?

` +
    `${preserves} eleve(s) sont conserves : les licencies AS et ceux deja inscrits dans un groupe.
` +
    `Les groupes eux-memes ne sont pas touches.

Cette action est definitive.`
  )) return;

  const ids = aSupprimer.map(s => s.id);
  const TAILLE_LOT = 200;
  let supprimes = 0;
  for (let i = 0; i < ids.length; i += TAILLE_LOT) {
    const lot = ids.slice(i, i + TAILLE_LOT);
    const res = await apiFetch(
      `${SUPABASE_URL}/rest/v1/unss_students?id=in.(${lot.map(encodeURIComponent).join(",")})`,
      { method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: new Date().toISOString() }) }
    );
    if (!res.ok) {
      await loadUnssStudents();
      renderUnssTab();
      alert(`${supprimes} eleve(s) supprime(s), puis l'operation s'est interrompue. Relancez pour terminer.`);
      return;
    }
    supprimes += lot.length;
  }
  try { await modeHorsConnexion?.synchroniser(); } catch { /* la lecture suivante reessaiera */ }
  await loadUnssStudents();
  renderUnssTab();
  alert(`${supprimes} eleve(s) supprime(s). ${preserves} conserve(s) (licencies AS et inscrits en groupe).`);
}

/** Meme principe que le CSV Planning : intitules reconnus dans n'importe quel ordre. */
async function importUnssCsv(csv, markLicensed) {
  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return;
  const delimiter = (lines[0].split(";").length > lines[0].split(",").length) ? ";" : ",";
  // NFD separe la lettre de son accent, et on retire les accents : couvre tout l'alphabet
  // francais au lieu de la liste ecrite a la main. Le BOM d'un CSV Excel est retire aussi,
  // sinon la premiere colonne s'appellerait "﻿nom" et ne serait jamais reconnue.
  const norm = (v) => v.replace(/^﻿/, "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    // "Classe d'origine" et "Classe d’origine" designent la meme colonne : le tableur choisit
    // l'apostrophe droite ou courbe selon l'humeur du logiciel qui a produit l'export.
    .replace(/['’]/g, " ")
    // "Ne(e) le" est la meme colonne que "Ne le" : la parenthese ne sert qu'a l'accord.
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ").trim();

  /**
   * Compare un en-tete a un intitule connu, au singulier pres.
   *
   * Les exports ecrivent "Mail parents" ou "Emails parents" selon le logiciel, et la colonne
   * restait muette pour un seul "s" - donc aucun mail parent n'etait importe, sans un mot.
   */
  const auSingulier = (v) => v.split(" ").map(m => m.replace(/s$/, "")).join(" ");
  const memeEntete = (entete, intitule) => auSingulier(entete) === auSingulier(intitule);
  const ALIASES = {
    nom: ["nom", "nom de famille", "lastname", "last name"],
    prenom: ["prenom", "firstname", "first name"],
    naissance: ["date de naissance", "date naissance", "naissance", "ddn", "ne le", "nee le"],
    voeu1: ["voeu 1", "activite voeu 1", "activite 1", "voeu1"],
    voeu2: ["voeu 2", "activite voeu 2", "activite 2", "voeu2"],
    voeu3: ["voeu 3", "activite voeu 3", "activite 3", "voeu3"],
    emailEleve: ["email eleve", "mail eleve", "email"],
    emailParent: ["email parent", "mail parent", "emails parent", "emails parents"],
    sexe: ["sexe", "sex", "genre", "civilite"],
    // L'export d'etablissement nomme cette colonne de plusieurs facons selon le logiciel.
    division: ["division", "classe", "classe origine", "classe d origine", "groupe classe", "div"]
  };
  const header = lines[0].split(delimiter).map(norm);
  const idx = (key) => header.findIndex(h => ALIASES[key].some(intitule => memeEntete(h, intitule)));
  const iNom = idx("nom"), iPrenom = idx("prenom"), iNaissance = idx("naissance");
  const iVoeu1 = idx("voeu1"), iVoeu2 = idx("voeu2"), iVoeu3 = idx("voeu3");
  const iEmailEleve = idx("emailEleve"), iEmailParent = idx("emailParent");
  const iSexe = idx("sexe"), iDivision = idx("division");
  const hasHeader = iNom >= 0 || iPrenom >= 0;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const schoolYear = (document.getElementById("schoolYear") || {}).value || "2026-2027";

  const rows = [];
  let ignorees = 0, entetesRepetees = 0;
  for (const line of dataLines) {
    const fields = line.split(delimiter).map(f => f.trim());
    const lastName = hasHeader ? (fields[iNom] || "") : (fields[0] || "");
    const firstName = hasHeader ? (fields[iPrenom] || "") : (fields[1] || "");
    if (!lastName || !firstName) { ignorees++; continue; }
    // Un export d'etablissement est parfois plusieurs extractions collees bout a bout : la
    // ligne d'entete reapparait alors au milieu du fichier, et creerait un eleve "Nom Prenom".
    if (ALIASES.nom.some(i => memeEntete(norm(lastName), i)) && ALIASES.prenom.some(i => memeEntete(norm(firstName), i))) {
      entetesRepetees++; continue;
    }
    const birthDate = iNaissance >= 0 ? parseFrDate(fields[iNaissance]) : null;
    // Ni identifiant ni categorie ici : le premier depend du rapprochement (une fiche reconnue
    // garde le sien), la seconde se deduit de la date de naissance au moment d'enregistrer.
    rows.push({
      last_name: lastName, first_name: firstName,
      birth_date_epoch_millis: birthDate,
      sex: iSexe >= 0 ? normalizeSex(fields[iSexe]) : "",
      division: iDivision >= 0 ? (fields[iDivision] || "").trim() : "",
      wish1: iVoeu1 >= 0 ? (fields[iVoeu1] || "") : "",
      wish2: iVoeu2 >= 0 ? (fields[iVoeu2] || "") : "",
      wish3: iVoeu3 >= 0 ? (fields[iVoeu3] || "") : "",
      student_email: iEmailEleve >= 0 ? (fields[iEmailEleve] || null) : null,
      parent_email: iEmailParent >= 0 ? (fields[iEmailParent] || null) : null
    });
  }

  // On ne cree plus a l'aveugle : on compare d'abord au repertoire, puis on montre ce qu'on
  // compte faire. Un export d'etablissement arrive rarement complet, et il faut pouvoir le
  // reimporter enrichi sans doubler tout le college.
  const rapport = ImportEleves.rapprocherEleves(unssStudents, rows);
  rapport.contexte = { markLicensed, schoolYear, ignorees, entetesRepetees };
  importEnCours = rapport;
  choixDivergences = {};
  choixAmbigus = {};
  renderRapportImport();
}

// ---- Import du repertoire : ce qu'on compte faire, avant de le faire ----
//
// Trois decisions restent au professeur, et aucune n'est prise a sa place : arbitrer une valeur
// qui differe, dire qui est qui quand deux homonymes se ressemblent, et valider l'ensemble.
// Tant qu'il n'a pas valide, rien n'est envoye.

let importEnCours = null;
let choixDivergences = {};   // "indexReconnu|champ" -> "nouvelle"
let choixAmbigus = {};       // "indexAmbigu" -> id d'un eleve existant, ou "nouveau"

function valeurLisible(champ, valeur) {
  if (valeur === null || valeur === undefined || valeur === "") return "(vide)";
  // Heure locale, comme partout ailleurs dans le repertoire : forcer UTC affichait la veille.
  if (champ === "birth_date_epoch_millis") return formatFrDate(valeur) || String(valeur);
  return String(valeur);
}

function nomComplet(e) {
  return `${String(e.last_name || "").toUpperCase()} ${e.first_name || ""}`.trim();
}

function renderRapportImport() {
  // Le repertoire s'affiche dans deux conteneurs selon l'onglet : "Liste eleve" sous Classe, et
  // "Licencies AS" sous ASLVH. Le recapitulatif doit prendre la place de celui qui est visible,
  // sinon il s'ecrit dans un element masque et le professeur ne voit rien se passer.
  const wrap = document.getElementById(unssCibleRendu) || document.getElementById("unssList");
  const r = importEnCours;
  if (!r) return;
  const chiffres = r.resume;

  let html = `<div class="card">
    <div class="top"><h2 style="margin:0">Import : ce qui va etre fait</h2>
      <button class="secondary" id="importAnnuler" style="margin-top:0">Annuler</button></div>
    <ul class="tight" style="margin:10px 0 0; padding-left:18px">
      <li><strong>${chiffres.reconnus}</strong> eleve(s) reconnu(s)</li>
      <li><strong>${chiffres.completes}</strong> fiche(s) completee(s)</li>
      <li><strong>${chiffres.divergences}</strong> divergence(s) a verifier</li>
      <li><strong>${chiffres.nouveaux}</strong> nouvel(s) eleve(s)</li>
      <li><strong>${chiffres.ambigus}</strong> cas ambigu(s) a trancher</li>
      <li><strong>0</strong> doublon cree</li>
    </ul>
    <div class="muted" style="margin-top:8px">${r.absentsDuFichier.length} eleve(s) du repertoire
      ne figurent pas dans ce fichier : ils ne sont pas touches.</div>`;

  if (r.contexte.ignorees || r.contexte.entetesRepetees) {
    html += `<div class="muted" style="margin-top:6px">${r.contexte.ignorees} ligne(s) sans nom ni
      prenom et ${r.contexte.entetesRepetees} ligne(s) d'entete ignorees dans le fichier.</div>`;
  }
  html += `</div>`;

  // --- Les divergences : une valeur des deux cotes, mais pas la meme ---
  const avecDesaccord = r.reconnus
    .map((reconnu, index) => ({ reconnu, index }))
    .filter(x => x.reconnu.divergences.length > 0);
  if (avecDesaccord.length) {
    html += `<div class="card" style="margin-top:12px">
      <h3 style="margin:0 0 4px">Divergences</h3>
      <div class="muted">Sans choix de votre part, l'ancienne valeur est conservee.</div>`;
    avecDesaccord.forEach(({ reconnu, index }) => {
      html += `<div class="card" style="margin-top:8px"><strong>${planningText(nomComplet(reconnu.existant))}</strong>`;
      reconnu.divergences.forEach(d => {
        const cle = `${index}|${d.champ}`;
        html += `<div style="margin-top:6px">
          <div class="muted" style="font-size:12px">${planningText(ImportEleves.LIBELLES[d.champ] || d.champ)}</div>
          <label style="margin-right:14px"><input type="radio" name="div-${cle}" value="ancienne"
            data-divergence="${cle}" ${choixDivergences[cle] === "nouvelle" ? "" : "checked"}>
            ${planningText(valeurLisible(d.champ, d.ancienne))} <span class="muted">(actuelle)</span></label>
          <label><input type="radio" name="div-${cle}" value="nouvelle"
            data-divergence="${cle}" ${choixDivergences[cle] === "nouvelle" ? "checked" : ""}>
            ${planningText(valeurLisible(d.champ, d.nouvelle))} <span class="muted">(fichier)</span></label>
        </div>`;
      });
      html += `</div>`;
    });
    html += `</div>`;
  }

  // --- Les cas ambigus : on ne devine pas, on demande ---
  if (r.ambigus.length) {
    html += `<div class="card" style="margin-top:12px">
      <h3 style="margin:0 0 4px">Cas ambigus</h3>
      <div class="muted">Sans choix de votre part, ces lignes sont ignorees : mieux vaut les
        reprendre plus tard qu'ecrire dans la mauvaise fiche.</div>`;
    r.ambigus.forEach((cas, index) => {
      html += `<div class="card" style="margin-top:8px">
        <strong>${planningText(nomComplet(cas.importe))}</strong>
        <div class="muted" style="font-size:12px">${planningText(cas.raison)}</div>
        <div style="margin-top:6px">
          <label style="display:block"><input type="radio" name="amb-${index}" value=""
            data-ambigu="${index}" ${choixAmbigus[index] ? "" : "checked"}> Ignorer cette ligne</label>
          ${cas.candidats.map(c => `<label style="display:block"><input type="radio" name="amb-${index}"
            value="${planningText(c.id)}" data-ambigu="${index}"
            ${choixAmbigus[index] === c.id ? "checked" : ""}> Completer ${planningText(nomComplet(c))}
            <span class="muted">${planningText(valeurLisible("birth_date_epoch_millis", c.birth_date_epoch_millis))}
            · ${planningText(c.division || "sans division")}</span></label>`).join("")}
          <label style="display:block"><input type="radio" name="amb-${index}" value="nouveau"
            data-ambigu="${index}" ${choixAmbigus[index] === "nouveau" ? "checked" : ""}>
            Creer un nouvel eleve</label>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  html += `<div class="card" style="margin-top:12px">
    <button id="importValider">Valider l'import</button>
    <button class="secondary" id="importAnnuler2">Annuler</button>
    <div class="error" id="importErreur"></div>
  </div>`;

  wrap.innerHTML = html;

  wrap.querySelectorAll("[data-divergence]").forEach(radio => radio.addEventListener("change", () => {
    choixDivergences[radio.dataset.divergence] = radio.value;
  }));
  wrap.querySelectorAll("[data-ambigu]").forEach(radio => radio.addEventListener("change", () => {
    choixAmbigus[radio.dataset.ambigu] = radio.value;
  }));
  const annuler = () => { importEnCours = null; renderUnssTab(); };
  document.getElementById("importAnnuler").onclick = annuler;
  document.getElementById("importAnnuler2").onclick = annuler;
  document.getElementById("importValider").onclick = appliquerImport;
}

/**
 * Enregistre ce que le recapitulatif annonce.
 *
 * Les fiches reconnues gardent leur identifiant : c'est ce qui evite le doublon. Les envois
 * partent par paquets - un export d'etablissement depasse facilement le millier de lignes - et on
 * s'arrete au premier paquet refuse pour annoncer un total honnete.
 */
async function appliquerImport() {
  const r = importEnCours;
  if (!r) return;
  const bouton = document.getElementById("importValider");
  const erreur = document.getElementById("importErreur");
  bouton.disabled = true; bouton.textContent = "Enregistrement...";
  erreur.textContent = "";

  const { markLicensed, schoolYear } = r.contexte;
  const maintenant = new Date().toISOString();

  const preparer = (fiche, existant) => {
    const complete = { ...fiche };
    // La categorie se deduit de la date de naissance : elle se recalcule des que celle-ci arrive,
    // au lieu d'etre arbitree comme une donnee.
    complete.category = computeUnssCategory(complete.birth_date_epoch_millis, schoolYear);
    // Un import de licencies rend licencie ; il ne retire jamais une licence.
    complete.licensed = markLicensed || Boolean(existant && existant.licensed);
    complete.user_id = complete.user_id || session.user_id;
    complete.updated_at = maintenant;
    complete.deleted = false;
    return complete;
  };

  const aEnvoyer = [];
  r.reconnus.forEach((reconnu, index) => {
    const choix = {};
    reconnu.divergences.forEach(d => {
      if (choixDivergences[`${index}|${d.champ}`] === "nouvelle") choix[d.champ] = "nouvelle";
    });
    const fiche = ImportEleves.ficheFusionnee(reconnu, choix);
    if (reconnu.aCompleter.length === 0 && Object.keys(choix).length === 0) return; // rien a ecrire
    aEnvoyer.push(preparer(fiche, reconnu.existant));
  });

  r.ambigus.forEach((cas, index) => {
    const decision = choixAmbigus[index];
    if (!decision) return;                                    // ignore, comme annonce
    if (decision === "nouveau") {
      aEnvoyer.push(preparer({ ...cas.importe, id: crypto.randomUUID() }, null));
      return;
    }
    const existant = cas.candidats.find(c => c.id === decision);
    if (!existant) return;
    const reconnu = { existant, importe: cas.importe,
      aCompleter: ImportEleves.CHAMPS
        .filter(([champ]) => !ImportEleves.estVide(cas.importe[champ]) && ImportEleves.estVide(existant[champ]))
        .map(([champ]) => ({ champ, valeur: cas.importe[champ] })),
      divergences: [] };
    aEnvoyer.push(preparer(ImportEleves.ficheFusionnee(reconnu), existant));
  });

  r.nouveaux.forEach(nouveau => {
    aEnvoyer.push(preparer({ ...nouveau, id: crypto.randomUUID() }, null));
  });

  let envoyes = 0;
  const TAILLE_LOT = 200;
  try {
    for (let i = 0; i < aEnvoyer.length; i += TAILLE_LOT) {
      const lot = aEnvoyer.slice(i, i + TAILLE_LOT);
      const res = await apiFetch(`${SUPABASE_URL}/rest/v1/unss_students`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(lot)
      });
      if (!res.ok) throw new Error(`Envoi interrompu apres ${envoyes} eleve(s).`);
      envoyes += lot.length;
    }
    // L'import part en lots directs - mille fiches n'ont rien a faire dans une file d'attente
    // pensee pour la saisie a l'unite, et il se fait devant un ordinateur, pas sur un terrain.
    // Mais l'affichage, lui, lit la copie locale : sans synchronisation ici, la liste montrerait
    // l'etat d'avant l'import.
    try { await modeHorsConnexion?.synchroniser(); } catch { /* la lecture suivante reessaiera */ }
  } catch (e) {
    bouton.disabled = false; bouton.textContent = "Valider l'import";
    // Reimporter le meme fichier ne creera pas de doublon : les fiches deja envoyees seront
    // reconnues. C'est tout l'interet du rapprochement, et il faut le dire.
    erreur.textContent = `${e.message} Vous pouvez relancer le meme fichier : les eleves deja enregistres seront reconnus, sans doublon.`;
    return;
  }

  importEnCours = null;
  await loadUnssStudents();
  renderUnssTab();
  alert(`${r.resume.reconnus} eleve(s) reconnu(s), ${r.resume.nouveaux} ajoute(s), aucun doublon.`);
}

// ---- UNSS > Creneaux AS : l'offre d'activites parmi laquelle se formulent les voeux ----

function renderUnssSlotsTab() {
  const wrap = document.getElementById("unssList");
  let html = `<div style="display:flex; justify-content:flex-end; gap:8px; margin-bottom:10px">
    <button id="unssSlotAddBtn" style="margin-top:0">Ajouter un creneau</button></div>`;

  if (unssSlots.length === 0) {
    html += `<div class="muted">Aucun creneau AS. Creez-en un : c'est parmi ces creneaux que
      les eleves formulent leurs trois voeux au moment de leur licence.</div>`;
  } else {
    html += unssSlots.map(slot => {
      const detail = [capitaliseJour(slot.day_of_week),
        [slot.start_time, slot.end_time].filter(Boolean).join(" - "),
        slot.location].filter(Boolean).join(" · ");
      const demandes = compterVoeux(slot.id);
      const places = slot.max_places ? ` / ${slot.max_places} places` : "";
      return `<div class="card unssCard" data-slot="${slot.id}">
        <div>
          <div><strong>${unssText(slot.activity_name || "Creneau sans nom")}</strong></div>
          <div class="muted">${unssText(detail) || "Horaire non renseigne"}</div>
          <div class="muted" style="font-size:12px">${demandes} voeu(x)${places}</div>
        </div>
        <button class="danger" data-slot-delete="${slot.id}" style="margin-top:0">Supprimer</button>
      </div>`;
    }).join("");
  }
  wrap.innerHTML = html;

  document.getElementById("unssSlotAddBtn").addEventListener("click", () => openUnssSlotPanel(null));
  wrap.querySelectorAll("[data-slot]").forEach(el => {
    el.addEventListener("click", () => openUnssSlotPanel(unssSlots.find(x => x.id === el.dataset.slot)));
  });
  wrap.querySelectorAll("[data-slot-delete]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await supprimerCreneau(btn.dataset.slotDelete);
    });
  });
}

/** Nombre d'eleves ayant place ce creneau dans l'un de leurs trois voeux. */
function compterVoeux(slotId) {
  return unssStudents.filter(s =>
    s.wish1_slot_id === slotId || s.wish2_slot_id === slotId || s.wish3_slot_id === slotId).length;
}

/**
 * Supprimer un creneau demande par des eleves effacerait leur voeu sans que rien ne le
 * signale : on annonce le nombre concerne avant de confirmer. Les voeux gardent leur
 * intitule lisible (wish1/2/3), seule la reference au creneau disparait.
 */
async function supprimerCreneau(slotId) {
  const demandes = compterVoeux(slotId);
  const slot = unssSlots.find(x => x.id === slotId);
  const avertissement = demandes > 0
    ? `

Attention : ${demandes} eleve(s) ont place ce creneau dans leurs voeux. Le voeu restera lisible mais ne pointera plus sur un creneau.`
    : "";
  if (!confirm(`Supprimer le creneau "${slot ? slot.activity_name : ""}" ?${avertissement}`)) return;
  try { await supprimerLigne("unss_slots", slotId); }
  catch (erreur) { alert(erreur.message || "Creneau non supprime. Verifiez votre connexion."); return; }
  await loadUnssSlots();
  renderUnssTab();
}

function openUnssSlotPanel(slot) {
  const panel = document.getElementById("unssPanel");
  const isNew = !slot;
  panel.innerHTML = `
    <h2>${isNew ? "Nouveau creneau AS" : "Modifier le creneau"}</h2>
    <label for="unssSlotActivity">Activite</label>
    <input type="text" id="unssSlotActivity" value="${slot ? unssText(slot.activity_name) : ""}" placeholder="Badminton, Cross, Futsal...">
    <label for="unssSlotDay">Jour</label>
    <select id="unssSlotDay">
      <option value="">Non renseigne</option>
      ${UNSS_SLOT_DAYS.map(j => `<option value="${j}"${slot && slot.day_of_week === j ? " selected" : ""}>${capitaliseJour(j)}</option>`).join("")}
    </select>
    <label for="unssSlotStart">Heure de debut</label>
    <input type="time" id="unssSlotStart" value="${slot ? slot.start_time || "" : ""}">
    <label for="unssSlotEnd">Heure de fin</label>
    <input type="time" id="unssSlotEnd" value="${slot ? slot.end_time || "" : ""}">
    <label for="unssSlotLocation">Lieu</label>
    <input type="text" id="unssSlotLocation" value="${slot ? unssText(slot.location) : ""}" placeholder="Gymnase, stade...">
    <label for="unssSlotPlaces">Places (facultatif)</label>
    <input type="number" id="unssSlotPlaces" min="1" value="${slot && slot.max_places ? slot.max_places : ""}">
    <label for="unssSlotComment">Commentaire</label>
    <input type="text" id="unssSlotComment" value="${slot ? unssText(slot.comment) : ""}">
    <button id="unssSlotSaveBtn">Enregistrer</button>
    <button class="secondary" id="unssSlotCancelBtn">Annuler</button>
    <div class="error" id="unssSlotError"></div>`;
  ouvrirFenetreUnss();

  document.getElementById("unssSlotCancelBtn").addEventListener("click", () => fermerFenetreUnss());
  document.getElementById("unssSlotSaveBtn").addEventListener("click", async () => {
    const activite = document.getElementById("unssSlotActivity").value.trim();
    if (!activite) { document.getElementById("unssSlotError").textContent = "L'activite est obligatoire."; return; }
    const places = parseInt(document.getElementById("unssSlotPlaces").value, 10);
    const body = {
      activity_name: activite,
      day_of_week: document.getElementById("unssSlotDay").value,
      start_time: document.getElementById("unssSlotStart").value,
      end_time: document.getElementById("unssSlotEnd").value,
      location: document.getElementById("unssSlotLocation").value.trim(),
      max_places: Number.isFinite(places) && places > 0 ? places : null,
      comment: document.getElementById("unssSlotComment").value.trim(),
      updated_at: new Date().toISOString()
    };
    try {
      // institution_id est pose par le declencheur cote base : ne pas l'envoyer d'ici.
      if (isNew) {
        await enregistrerLigne("unss_slots",
          { id: crypto.randomUUID(), user_id: session.user_id, deleted: false, ...body });
      } else {
        await enregistrerLigne("unss_slots", { ...slot, ...body });
      }
    } catch (erreur) {
      document.getElementById("unssSlotError").textContent =
        erreur.message || "Creneau non enregistre. Verifiez votre connexion.";
      return;
    }
    fermerFenetreUnss();
    await loadUnssSlots();
    renderUnssTab();
  });
}

/** Etape 1 pour licencier : on coche l'eleve deja present dans le repertoire Eleve LVH. */
/** Comparaison tolerante : sans accent, sans casse, pour chercher "Benoit" et trouver "Benoit". */
function chaineRecherche(valeur) {
  return String(valeur || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/**
 * Classe les eleves par pertinence : un nom qui commence par la recherche passe avant un nom
 * qui la contient au milieu. Sur un repertoire d'etablissement de plus de mille eleves, une
 * simple liste alphabetique obligerait a faire defiler pour rien.
 */
function chercherEleves(eleves, recherche) {
  const q = chaineRecherche(recherche);
  if (!q) return eleves;
  const mots = q.split(/\s+/).filter(Boolean);
  return eleves
    .map(s => {
      const nom = chaineRecherche(s.last_name), prenom = chaineRecherche(s.first_name);
      // Chaque mot tape doit se retrouver quelque part : "abat nil" trouve ABAT Nil.
      if (!mots.every(m => nom.includes(m) || prenom.includes(m))) return null;
      const debut = mots.some(m => nom.startsWith(m) || prenom.startsWith(m));
      return { eleve: s, score: debut ? 0 : 1 };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score ||
      a.eleve.last_name.localeCompare(b.eleve.last_name, "fr") ||
      a.eleve.first_name.localeCompare(b.eleve.first_name, "fr"))
    .map(r => r.eleve);
}

/** Page courante de la fenetre de licence. Le repertoire depasse le millier de fiches. */
let pageLicence = 1;

/**
 * Choisir un eleve a licencier, dans le meme tableau que la Liste eleve.
 *
 * La fenetre n'affichait qu'une liste de noms : dans un repertoire de mille huit cents eleves,
 * deux "BENNANI Lina" ne se distinguent pas. On y retrouve donc les memes colonnes qu'ailleurs -
 * naissance, division, sexe, adresses - et la meme pagination, pour reconnaitre l'eleve avant de
 * le licencier plutot qu'apres.
 *
 * Sans case a cocher : licencier ouvre la fiche de l'eleve pour y saisir categorie, voeux et
 * taille de maillot. C'est un geste par eleve, pas une selection multiple.
 */
function openUnssPickPanel() {
  pageLicence = 1;
  const candidates = unssStudents.filter(s => !s.licensed);
  const panel = document.getElementById("unssPanel");
  panel.innerHTML = `<h2>Choisir un eleve a licencier</h2>` +
    (candidates.length === 0
      ? `<div class="muted">Tous les eleves du repertoire sont deja licencies, ou le repertoire Eleve LVH est vide. Importez-le d'abord dans cet onglet.</div>`
      : `<input type="search" id="unssPickSearch" placeholder="Rechercher un nom ou un prenom" autocomplete="off" style="width:100%">
         <div class="muted" id="unssPickCount" style="margin:8px 0"></div>
         <div id="unssPickResults"></div>`
    ) +
    `<button class="secondary" id="unssPickCancel" style="margin-top:14px">Annuler</button>`;
  ouvrirFenetreUnss();

  const resultats = document.getElementById("unssPickResults");
  if (resultats) {
    const champ = document.getElementById("unssPickSearch");
    const compteur = document.getElementById("unssPickCount");

    const afficher = () => {
      const trouves = trierEleves(chercherEleves(candidates, champ.value.trim()));
      const totalPages = Math.max(1, Math.ceil(trouves.length / TAILLE_PAGE_LISTE));
      if (pageLicence > totalPages) pageLicence = totalPages;
      const debut = (pageLicence - 1) * TAILLE_PAGE_LISTE;
      const page = trouves.slice(debut, debut + TAILLE_PAGE_LISTE);

      compteur.textContent = trouves.length === 0
        ? "Aucun eleve ne correspond."
        : `${debut + 1}–${debut + page.length} sur ${trouves.length} eleve(s) a licencier`;
      resultats.innerHTML = paginationHtml(pageLicence, totalPages, "licence")
        + tableauLicenceHtml(page);

      resultats.querySelectorAll("[data-licence-page]").forEach(b =>
        b.addEventListener("click", () => { pageLicence = Number(b.dataset.licencePage); afficher(); }));
      resultats.querySelectorAll("[data-licence-tri]").forEach(b =>
        b.addEventListener("click", () => {
          const cle = b.dataset.licenceTri;
          triEleve = { cle, croissant: triEleve.cle === cle ? !triEleve.croissant : true };
          afficher();
        }));
      resultats.querySelectorAll("[data-licence-eleve]").forEach(ligne =>
        ligne.addEventListener("click", () => {
          openUnssStudentPanel(unssStudents.find(s => s.id === ligne.dataset.licenceEleve), true);
        }));
    };

    champ.addEventListener("input", () => { pageLicence = 1; afficher(); });
    afficher();
    champ.focus();
  }
  document.getElementById("unssPickCancel").addEventListener("click", () => fermerFenetreUnss());
}

/** Le tableau de la fenetre de licence : memes colonnes que la Liste eleve, sans case a cocher. */
function tableauLicenceHtml(eleves) {
  let html = `<div class="tableDefilante"><table class="eleveTable"><thead><tr>`;
  COLONNES_ELEVE.forEach(c => {
    const actif = triEleve.cle === c.cle;
    html += `<th><button type="button" class="eleveTri${actif ? " actif" : ""}" data-licence-tri="${c.cle}">`
      + `${planningText(c.titre)}${actif ? (triEleve.croissant ? " ▲" : " ▼") : ""}</button></th>`;
  });
  html += `</tr></thead><tbody>`;
  eleves.forEach(e => {
    html += `<tr class="unssPickLigne" data-licence-eleve="${e.id}">`
      + COLONNES_ELEVE.map(c => `<td>${planningText(c.texte ? c.texte(e) : c.valeur(e))}</td>`).join("")
      + `</tr>`;
  });
  return html + `</tbody></table></div>`;
}

/** Etape 2 (ou modification directe) : identite + categorie + voeux + taille maillot + emails. */
function openUnssStudentPanel(student, licensing) {
  const panel = document.getElementById("unssPanel");
  const isNew = !student;
  const category = student ? student.category : "MINIME";
  panel.innerHTML = `
    <h2>${licensing ? "Licencier " + (student.first_name || "") : (isNew ? "Nouvel eleve" : "Modifier l'eleve")}</h2>
    <label for="unssLastName">Nom</label>
    <input type="text" id="unssLastName" value="${student ? student.last_name : ""}">
    <label for="unssFirstName">Prenom</label>
    <input type="text" id="unssFirstName" value="${student ? student.first_name : ""}">
    <label for="unssDivision">Division (classe d'origine)</label>
    <input type="text" id="unssDivision" placeholder="ex : 2.1, 6e3" value="${student ? (student.division || "") : ""}">
    <label for="unssBirth">Date de naissance (JJ/MM/AAAA)</label>
    <input type="text" id="unssBirth" value="${formatFrDate(student ? student.birth_date_epoch_millis : null)}">
    <label for="unssSex">Sexe</label>
    <select id="unssSex">
      <option value=""${!student || !student.sex ? " selected" : ""}>Non renseigne</option>
      <option value="M"${student && student.sex === "M" ? " selected" : ""}>Garcon</option>
      <option value="F"${student && student.sex === "F" ? " selected" : ""}>Fille</option>
    </select>
    <label for="unssCategory">Categorie</label>
    <select id="unssCategory">${UNSS_CATEGORIES.map(c => `<option value="${c.value}"${c.value === category ? " selected" : ""}>${unssCategoryLabel(c.value, student ? student.sex : "")}</option>`).join("")}</select>
    ${licensing || (student && student.licensed) ? `
      ${[1, 2, 3].map(n => `
        <label for="unssWish${n}">Voeu ${n}</label>
        ${menuCreneaux(`unssWish${n}`, student ? student[`wish${n}_slot_id`] : null, student ? student[`wish${n}`] : "")}
      `).join("")}
      <label for="unssJersey">Taille maillot</label>
      <input type="text" id="unssJersey" value="${student ? student.jersey_size || "" : ""}">
      <label for="unssEmailEleve">Email eleve</label>
      <input type="text" id="unssEmailEleve" value="${student ? student.student_email || "" : ""}">
      <label for="unssEmailParent">Email parent</label>
      <input type="text" id="unssEmailParent" value="${student ? student.parent_email || "" : ""}">
    ` : ""}
    <button id="unssSaveBtn">Enregistrer</button>
    <button class="secondary" id="unssCancelBtn">Annuler</button>
    <div class="error" id="unssError"></div>`;
  ouvrirFenetreUnss();

  document.getElementById("unssBirth").addEventListener("change", () => {
    if (!isNew) return;
    const birth = parseFrDate(document.getElementById("unssBirth").value);
    const schoolYear = (document.getElementById("schoolYear") || {}).value || "2026-2027";
    document.getElementById("unssCategory").value = computeUnssCategory(birth, schoolYear);
  });
  document.getElementById("unssSex").addEventListener("change", () => {
    // Les intitules de categorie s'accordent au sexe : on les reecrit sans perdre la selection.
    const select = document.getElementById("unssCategory");
    const choisie = select.value, sexe = document.getElementById("unssSex").value;
    select.innerHTML = UNSS_CATEGORIES
      .map(c => `<option value="${c.value}"${c.value === choisie ? " selected" : ""}>${unssCategoryLabel(c.value, sexe)}</option>`)
      .join("");
  });
  document.getElementById("unssCancelBtn").addEventListener("click", () => fermerFenetreUnss());
  document.getElementById("unssSaveBtn").addEventListener("click", async () => {
    const lastName = document.getElementById("unssLastName").value.trim();
    const firstName = document.getElementById("unssFirstName").value.trim();
    if (!lastName || !firstName) { document.getElementById("unssError").textContent = "Nom et prenom obligatoires."; return; }
    const birth = parseFrDate(document.getElementById("unssBirth").value);
    const body = {
      last_name: lastName, first_name: firstName, birth_date_epoch_millis: birth,
      category: document.getElementById("unssCategory").value,
      sex: document.getElementById("unssSex").value,
      division: document.getElementById("unssDivision").value.trim(),
      updated_at: new Date().toISOString()
    };
    const wishField = document.getElementById("unssWish1");
    if (wishField) {
      body.licensed = true;
      // On enregistre la reference au creneau et son intitule lisible : l'intitule survit a
      // la suppression du creneau, et reste affichable pour les voeux saisis avant ce module.
      for (const n of [1, 2, 3]) {
        const slotId = document.getElementById(`unssWish${n}`).value;
        const slot = unssSlots.find(x => x.id === slotId);
        body[`wish${n}_slot_id`] = slotId || null;
        body[`wish${n}`] = slot ? unssSlotLabel(slot) : "";
      }
      body.jersey_size = document.getElementById("unssJersey").value;
      body.student_email = document.getElementById("unssEmailEleve").value || null;
      body.parent_email = document.getElementById("unssEmailParent").value || null;
    }
    // Ligne entiere : la file d'attente ne porte pas de retouches, et un envoi differe qui
    // n'emporterait que les champs saisis effacerait les autres.
    if (isNew) {
      await enregistrerLigne("unss_students",
        { id: crypto.randomUUID(), user_id: session.user_id, licensed: false, deleted: false, ...body });
    } else {
      await enregistrerLigne("unss_students", { ...student, ...body });
    }
    fermerFenetreUnss();
    await loadUnssStudents();
    renderUnssTab();
  });
}

// ---- UNSS > Groupe : liste des groupes, detail (membres + historique des seances) ----

function renderUnssGroupsTab() {
  const wrap = document.getElementById("unssList");
  let html = `<div style="display:flex; justify-content:flex-end; margin-bottom:10px"><button id="unssNewGroupBtn" style="margin-top:0">Nouveau groupe</button></div>`;
  if (unssGroups.length === 0) {
    html += `<div class="muted">Aucun groupe UNSS. Touchez "Nouveau groupe" pour en creer un (ex : Escalade, mercredi 13h-15h).</div>`;
  } else {
    unssGroups.forEach(g => {
      const schedule = [g.day_of_week, g.start_time, g.end_time].filter(Boolean).join(" · ");
      html += `<div class="card unssPick" data-group="${g.id}" style="margin-top:8px">
        <strong>${g.activity_name}</strong>
        <div class="muted">${schedule}${g.responsible_teacher ? " · Responsable : " + g.responsible_teacher : ""}</div>
      </div>`;
    });
  }
  wrap.innerHTML = html;
  document.getElementById("unssNewGroupBtn").addEventListener("click", () => openUnssGroupEditPanel(null));
  wrap.querySelectorAll("[data-group]").forEach(el => {
    el.addEventListener("click", () => openUnssGroupDetailPanel(unssGroups.find(g => g.id === el.dataset.group)));
  });
}

function openUnssGroupEditPanel(group) {
  const panel = document.getElementById("unssPanel");
  panel.innerHTML = `
    <h2>${group ? "Modifier le groupe" : "Nouveau groupe UNSS"}</h2>
    <label for="unssGroupActivity">Activite (ex : Escalade)</label>
    <input type="text" id="unssGroupActivity" value="${group ? group.activity_name : ""}">
    <label for="unssGroupDay">Jour</label>
    <input type="text" id="unssGroupDay" value="${group ? group.day_of_week : ""}">
    <label for="unssGroupStart">Heure de debut</label>
    <input type="text" id="unssGroupStart" value="${group ? group.start_time : ""}">
    <label for="unssGroupEnd">Heure de fin</label>
    <input type="text" id="unssGroupEnd" value="${group ? group.end_time : ""}">
    <label for="unssGroupResp">Professeur responsable</label>
    <input type="text" id="unssGroupResp" value="${group ? group.responsible_teacher : ""}">
    <button id="unssGroupSaveBtn">${group ? "Enregistrer" : "Creer"}</button>
    <button class="secondary" id="unssGroupCancelBtn">Annuler</button>`;
  ouvrirFenetreUnss();
  document.getElementById("unssGroupCancelBtn").addEventListener("click", () => fermerFenetreUnss());
  document.getElementById("unssGroupSaveBtn").addEventListener("click", async () => {
    const activityName = document.getElementById("unssGroupActivity").value.trim();
    if (!activityName) return;
    const body = {
      activity_name: activityName,
      day_of_week: document.getElementById("unssGroupDay").value.trim(),
      start_time: document.getElementById("unssGroupStart").value.trim(),
      end_time: document.getElementById("unssGroupEnd").value.trim(),
      responsible_teacher: document.getElementById("unssGroupResp").value.trim(),
      updated_at: new Date().toISOString()
    };
    if (group) {
      await enregistrerLigne("unss_groups", { ...group, ...body });
    } else {
      await enregistrerLigne("unss_groups",
        { id: crypto.randomUUID(), user_id: session.user_id, active: true, deleted: false, ...body });
    }
    fermerFenetreUnss();
    await loadUnssGroups();
    renderUnssTab();
  });
}

async function openUnssGroupDetailPanel(group) {
  const panel = document.getElementById("unssPanel");
  panel.innerHTML = `<h2>${group.activity_name}</h2><div class="muted">Chargement...</div>`;
  ouvrirFenetreUnss();

  const [memberships, sessions] = await Promise.all([
    lireTable("unss_memberships", `unss_memberships?group_id=eq.${group.id}&deleted=eq.false&select=*`,
      { ou: m => m.group_id === group.id }),
    lireTable("unss_sessions", `unss_sessions?group_id=eq.${group.id}&select=*&order=date_epoch_millis.desc`,
      { ou: x => x.group_id === group.id,
        trier: (a, b) => Number(b.date_epoch_millis || 0) - Number(a.date_epoch_millis || 0) })
  ]);
  const studentIds = memberships.map(m => m.student_id);
  let members = [];
  if (studentIds.length > 0) {
    members = await lireTable("unss_students",
      `unss_students?id=in.(${studentIds.join(",")})&select=*&order=last_name.asc`,
      { ou: e => studentIds.includes(e.id),
        trier: (a, b) => String(a.last_name || "").localeCompare(String(b.last_name || "")) });
  }

  const schedule = [group.day_of_week, group.start_time, group.end_time].filter(Boolean).join(" · ");
  panel.innerHTML = `
    <h2>${group.activity_name}</h2>
    <div class="muted">${schedule}${group.responsible_teacher ? " · Responsable : " + group.responsible_teacher : ""}</div>
    <h2 style="margin-top:16px; font-size:15px">Membres (${members.length})</h2>
    <div id="unssMembersList"></div>
    <button class="secondary" id="unssAddMemberBtn" style="margin-top:8px">+ Ajouter un membre</button>
    <h2 style="margin-top:16px; font-size:15px">Historique des seances (${sessions.length})</h2>
    <div class="muted">${sessions.length === 0 ? "Aucune seance." : sessions.map(s => new Date(s.date_epoch_millis).toLocaleDateString("fr-FR") + (s.label ? " — " + s.label : "")).join("<br>")}</div>
    <button id="unssGroupEditBtn" style="margin-top:14px">Modifier</button>
    <button class="secondary" id="unssGroupCloseBtn">Fermer</button>
    <button class="danger" id="unssGroupDeleteBtn">Supprimer le groupe</button>`;

  const membersListEl = document.getElementById("unssMembersList");
  membersListEl.innerHTML = members.length === 0
    ? `<div class="muted">Aucun membre. Ajoutez-en un.</div>`
    : members.map(s => `<div class="unssCard" style="padding:6px 0">
        <div>${s.last_name.toUpperCase()} ${s.first_name}</div>
        <div style="display:flex; gap:6px">
          <button class="secondary" data-member-stats="${s.id}" style="margin-top:0">Statistiques</button>
          <button class="danger" data-remove-member="${s.id}" style="margin-top:0">Retirer</button>
        </div>
      </div>`).join("");
  membersListEl.querySelectorAll("[data-member-stats]").forEach(btn => {
    btn.addEventListener("click", () => {
      const student = members.find(m => m.id === btn.dataset.memberStats);
      openUnssStudentStats(group, student, sessions);
    });
  });
  membersListEl.querySelectorAll("[data-remove-member]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const membership = memberships.find(m => m.student_id === btn.dataset.removeMember);
      if (membership) {
        try { await supprimerLigne("unss_memberships", membership.id); }
        catch (erreur) { alert(erreur.message); return; }
      }
      openUnssGroupDetailPanel(group);
    });
  });
  document.getElementById("unssAddMemberBtn").addEventListener("click", () => openUnssAddMemberPanel(group, members.map(m => m.id)));
  document.getElementById("unssGroupEditBtn").addEventListener("click", () => openUnssGroupEditPanel(group));
  document.getElementById("unssGroupCloseBtn").addEventListener("click", () => fermerFenetreUnss());
  document.getElementById("unssGroupDeleteBtn").addEventListener("click", async () => {
    try { await supprimerLigne("unss_groups", group.id); }
    catch (erreur) { alert(erreur.message); return; }
    fermerFenetreUnss();
    await loadUnssGroups();
    renderUnssTab();
  });
}

/**
 * Les panneaux ASLVH s'ouvrent par-dessus la page, comme Reglages et "Modifier la classe".
 *
 * Ils vivaient dans le flux de l'onglet : licencier un eleve, ajouter un membre ou ouvrir un
 * groupe faisait apparaitre un bloc plus bas, qu'il fallait aller chercher. Sept panneaux
 * partagent ce meme conteneur, et passent donc tous en fenetre d'un coup.
 *
 * Le noeud est deplace, pas refait : il garde ses identifiants et ses ecouteurs en changeant de
 * parent, la ou reecrire son balisage aurait tout casse.
 */
function fenetreUnss() {
  let voile = document.getElementById("unssPanelOverlay");
  if (voile) return voile;
  const panneau = document.getElementById("unssPanel");
  if (!panneau) return null;

  voile = document.createElement("div");
  voile.className = "searchOverlay";
  voile.id = "unssPanelOverlay";
  const feuille = document.createElement("div");
  feuille.className = "searchSheet";
  voile.appendChild(feuille);
  panneau.parentNode.insertBefore(voile, panneau);
  feuille.appendChild(panneau);
  panneau.style.display = "block";
  panneau.style.margin = "0";
  panneau.style.boxShadow = "none";

  voile.addEventListener("click", e => { if (e.target === voile) fermerFenetreUnss(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && voile.classList.contains("open")) fermerFenetreUnss();
  });
  return voile;
}

function ouvrirFenetreUnss() { fenetreUnss()?.classList.add("open"); }
function fermerFenetreUnss() { document.getElementById("unssPanelOverlay")?.classList.remove("open"); }

async function openUnssAddMemberPanel(group, excludeIds) {
  const panel = document.getElementById("unssPanel");
  panel.innerHTML = `<h2>Ajouter un membre</h2><div class="muted">Chargement...</div>`;
  const students = await lireTable("unss_students",
    "unss_students?deleted=eq.false&select=*&order=last_name.asc",
    { trier: (a, b) => String(a.last_name || "").localeCompare(String(b.last_name || "")) });
  const candidates = students.filter(s => !excludeIds.includes(s.id));
  // Un groupe AS se compose de licencies : les proposer d'abord, et tout de suite, plutot que
  // de noyer les quelques licencies dans les 1811 eleves du repertoire.
  const licencies = candidates.filter(s => s.licensed);
  panel.innerHTML = `<h2>Ajouter un membre</h2>` +
    (candidates.length === 0
      ? `<div class="muted">Aucun élève disponible dans Élèves LVH / Licenciés AS. Ajoutez les élèves au répertoire AS.</div>`
      : `${licencies.length === 0
            ? `<div class="muted" style="margin-bottom:8px">Aucun licencié AS pour l'instant : licenciez un élève depuis
                 <strong>Licenciés AS</strong>, ou cherchez ci-dessous dans tout le répertoire.</div>`
            : `<label style="display:flex; align-items:center; gap:8px; margin-bottom:8px">
                 <input type="checkbox" id="unssMemberTous" style="width:auto">
                 <span>Chercher dans tout le répertoire (${candidates.length} élèves), pas seulement les ${licencies.length} licencié(s)</span>
               </label>`}
         <input type="search" id="unssMemberSearch" placeholder="Rechercher un nom ou un prenom" autocomplete="off" style="width:100%">
         <div class="muted" id="unssMemberCount" style="margin:6px 0"></div>
         <div id="unssMemberResults"></div>`
    ) +
    `<button class="secondary" id="unssAddMemberCancel" style="margin-top:14px">Fermer</button>`;

  const zoneMembres = document.getElementById("unssMemberResults");
  if (zoneMembres) {
    const champ = document.getElementById("unssMemberSearch");
    const compteur = document.getElementById("unssMemberCount");
    const LIMITE_AFFICHAGE = 50;
    const caseTous = document.getElementById("unssMemberTous");
    const afficher = () => {
      const recherche = champ.value.trim();
      // Sans licencie, ou si l'on a coche la case, on cherche dans tout le repertoire.
      const source = (caseTous && !caseTous.checked && licencies.length) ? licencies : candidates;
      const trouves = chercherEleves(source, recherche);
      if (!recherche && source.length > LIMITE_AFFICHAGE) {
        compteur.textContent = `${source.length} eleves disponibles. Tapez un nom ou un prenom pour filtrer.`;
        zoneMembres.innerHTML = "";
        return;
      }
      const affiches = trouves.slice(0, LIMITE_AFFICHAGE);
      compteur.textContent = trouves.length === 0
        ? "Aucun eleve ne correspond."
        : `${trouves.length} eleve(s)${trouves.length > affiches.length ? ` — ${affiches.length} premiers affiches` : ""}`;
      zoneMembres.innerHTML = affiches.map(s =>
        `<div class="card unssPick" data-add-member="${s.id}" style="margin-top:6px">${s.last_name.toUpperCase()} ${s.first_name}</div>`
      ).join("");
      zoneMembres.querySelectorAll("[data-add-member]").forEach(el => {
        el.addEventListener("click", async () => {
          try {
            await enregistrerLigne("unss_memberships", {
              id: crypto.randomUUID(), user_id: session.user_id, group_id: group.id,
              student_id: el.dataset.addMember, updated_at: new Date().toISOString(), deleted: false
            });
          } catch (erreur) { alert(erreur.message); return; }
          openUnssGroupDetailPanel(group);
        });
      });
    };
    champ.addEventListener("input", afficher);
    if (caseTous) caseTous.addEventListener("change", afficher);
    afficher();
    champ.focus();
  }
  document.getElementById("unssAddMemberCancel").addEventListener("click", () => openUnssGroupDetailPanel(group));
}

// ---- UNSS > Appel : choisir un groupe, cocher present/absent, enregistrer une seance ----

function renderUnssAppelTab() {
  const wrap = document.getElementById("unssList");
  let html = `<label for="unssAppelGroupSelect">Groupe</label>
    <select id="unssAppelGroupSelect">
      <option value="">Choisir...</option>
      ${unssGroups.map(g => `<option value="${g.id}"${g.id === unssAppelGroupId ? " selected" : ""}>${g.activity_name}</option>`).join("")}
    </select>
    <div id="unssAppelBody" style="margin-top:14px"></div>`;
  wrap.innerHTML = html;
  document.getElementById("unssAppelGroupSelect").addEventListener("change", async (e) => {
    unssAppelGroupId = e.target.value || null;
    await loadUnssAppelMembers();
    renderUnssAppelBody();
  });
  if (unssAppelGroupId) renderUnssAppelBody();
}

async function loadUnssAppelMembers() {
  unssAppelMembers = [];
  unssAppelPresence = {};
  if (!unssAppelGroupId) return;
  const memberships = await lireTable("unss_memberships",
    `unss_memberships?group_id=eq.${unssAppelGroupId}&deleted=eq.false&select=*`,
    { ou: m => m.group_id === unssAppelGroupId });
  const studentIds = memberships.map(m => m.student_id);
  if (studentIds.length === 0) return;
  unssAppelMembers = await lireTable("unss_students",
    `unss_students?id=in.(${studentIds.join(",")})&select=*&order=last_name.asc`,
    { ou: e => studentIds.includes(e.id),
      trier: (a, b) => String(a.last_name || "").localeCompare(String(b.last_name || "")) });
  unssAppelMembers.forEach(s => { unssAppelPresence[s.id] = true; });

  // Les dispenses arrivent de l'onglet Sante : un eleve dispense ne peut pas faire la seance,
  // et l'appel doit le dire avant qu'on le pointe present.
  try {
    const jour = new Date().toISOString().slice(0, 10);
    const [dispenses, elevesDeClasse] = await Promise.all([
      lireTable("health_dispensations", "health_dispensations?deleted=eq.false&select=*"),
      lireTable("students", "students?deleted=eq.false&select=id,last_name,first_name,birth_date_epoch_millis")
    ]);
    unssAppelDispenses = dispensesDuJour(dispenses, elevesDeClasse, jour);
  } catch {
    // Sans dispenses lisibles l'appel reste possible : mieux vaut un appel sans rappel qu'un
    // ecran bloque au bord d'un gymnase.
    unssAppelDispenses = new Map();
  }
}

function renderUnssAppelBody() {
  const body = document.getElementById("unssAppelBody");
  if (!unssAppelGroupId) { body.innerHTML = ""; return; }
  if (unssAppelMembers.length === 0) {
    body.innerHTML = `<div class="muted">Ce groupe n'a aucun membre. Ajoutez-en depuis l'onglet Groupe.</div>`;
    return;
  }
  const todayLabel = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const dispenseDe = s => unssAppelDispenses.get(
    cleEleve(s.last_name, s.first_name, s.birth_date_epoch_millis));
  const dispenses = unssAppelMembers.filter(dispenseDe);
  const dateFr = d => d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR") : "";
  const motif = d => (typeof motifLibelle === "function" ? motifLibelle(d.reason_kind) : "") || "";
  body.innerHTML = `<div class="muted" style="margin-bottom:10px">Appel du ${todayLabel}</div>` +
    (dispenses.length
      ? `<div class="card" style="border-left:3px solid var(--danger); margin-bottom:10px">
           <strong>${dispenses.length} eleve(s) dispense(s) aujourd'hui</strong>
           <div class="muted">Ils ne peuvent pas faire la seance. Pointez-les selon leur presence
             au gymnase, mais ne les faites pas pratiquer.</div>
         </div>`
      : "") +
    unssAppelMembers.map(s => {
      const d = dispenseDe(s);
      return `
      <div class="unssCard" style="padding:8px 0${d ? "; background:#FDEEED" : ""}">
        <div>${s.last_name.toUpperCase()} ${s.first_name}${d
          ? `<div class="muted" style="font-size:12px; color:var(--danger)">Dispense jusqu'au ${dateFr(d.end_date)}${motif(d) ? ` · ${motif(d)}` : ""}${d.reason ? ` · ${d.reason}` : ""}</div>`
          : ""}</div>
        <div>
          <button data-present="${s.id}" style="margin-top:0; ${unssAppelPresence[s.id] ? "" : "background:var(--surface); color:var(--text); border:1px solid var(--border)"}">Present</button>
          <button data-absent="${s.id}" class="${unssAppelPresence[s.id] ? "secondary" : "danger"}" style="margin-top:0">Absent</button>
        </div>
      </div>`; }).join("") +
    `<button id="unssAppelSaveBtn" style="margin-top:14px; width:100%">Enregistrer l'appel</button>
     <div class="ok" id="unssAppelOk"></div>`;
  body.querySelectorAll("[data-present]").forEach(btn => btn.addEventListener("click", () => { unssAppelPresence[btn.dataset.present] = true; renderUnssAppelBody(); }));
  body.querySelectorAll("[data-absent]").forEach(btn => btn.addEventListener("click", () => { unssAppelPresence[btn.dataset.absent] = false; renderUnssAppelBody(); }));
  document.getElementById("unssAppelSaveBtn").addEventListener("click", async () => {
    const saveButton = document.getElementById("unssAppelSaveBtn");
    saveButton.disabled = true;
    try {
    // L'appel se fait dans un gymnase, c'est-a-dire souvent sans reseau. La seance et les
    // presences sont retenues ici et partiront a la reconnexion ; la seance d'abord, car une
    // presence qui arriverait seule designerait une seance inexistante.
    const sessionId = crypto.randomUUID();
    const maintenant = new Date().toISOString();
    try {
      await enregistrerLigne("unss_sessions", {
        id: sessionId, user_id: session.user_id, group_id: unssAppelGroupId,
        date_epoch_millis: Date.now(), label: "", updated_at: maintenant, deleted: false
      });
      for (const eleve of unssAppelMembers) {
        await enregistrerLigne("unss_attendance", {
          id: crypto.randomUUID(), user_id: session.user_id, session_id: sessionId,
          student_id: eleve.id, present: !!unssAppelPresence[eleve.id],
          updated_at: maintenant, deleted: false
        });
      }
    } catch (erreur) {
      saveButton.disabled = false;
      throw new Error(erreur.message || "L'appel n'a pas pu etre enregistre.");
    }
    // L'envoi des e-mails, lui, demande le reseau : sans lui l'appel est garde et les messages
    // attendent. C'est exactement ce qu'il faut dire, plutot que d'annoncer un echec.
    let dispatchResponse;
    try {
      dispatchResponse = await apiFetch(`${SUPABASE_URL}/functions/v1/eps-as-absence-email`, { method: "POST", body: "{}" });
    } catch (_) {
      document.getElementById("unssAppelOk").textContent = "Appel enregistre. Les e-mails restent en attente et seront reessayes a la prochaine synchronisation.";
      return;
    }
    const dispatch = await dispatchResponse.json().catch(() => ({}));
    const message = !dispatchResponse.ok
      ? "Appel enregistre. Les e-mails restent en attente et seront reessayes a la prochaine synchronisation."
      : dispatch.failed > 0
        ? `Appel enregistre. ${dispatch.sent || 0} e-mail(s) envoye(s), ${dispatch.failed} en attente.`
        : `Appel enregistre. ${dispatch.sent || 0} e-mail(s) d'absence envoye(s).`;
    document.getElementById("unssAppelOk").textContent = message;
    } finally {
      saveButton.disabled = false;
    }
  });
}

// ---- Statistiques UNSS d'un eleve (miroir de StudentUnssStatsScreen.kt) ----
// Seances du groupe, presences, absences, taux, puis l'historique date par date.
// Une seance sans ligne d'appel pour cet eleve compte comme une absence, comme dans l'app.

async function openUnssStudentStats(group, student, sessions) {
  const panel = document.getElementById("unssPanel");
  ouvrirFenetreUnss();
  panel.innerHTML = '<div class="muted">Chargement des statistiques...</div>';

  const sessionIds = sessions.map(s => s.id);
  let attendance = [];
  if (sessionIds.length) {
    attendance = await lireTable("unss_attendance",
      `unss_attendance?student_id=eq.${student.id}&session_id=in.(${sessionIds.join(",")})&select=*`,
      { ou: a => a.student_id === student.id && sessionIds.includes(a.session_id) });
  }

  const presenceBySession = {};
  attendance.forEach(a => { presenceBySession[a.session_id] = !!a.present; });

  const total = sessions.length;
  const present = sessions.filter(s => presenceBySession[s.id]).length;
  const absent = total - present;
  const rate = total === 0 ? 0 : Math.round((present / total) * 100);

  const ordered = sessions.slice().sort((a, b) => b.date_epoch_millis - a.date_epoch_millis);
  const history = total === 0
    ? '<div class="muted">Aucune seance enregistree pour ce groupe.</div>'
    : ordered.map(s => {
        const ok = presenceBySession[s.id];
        const date = new Date(s.date_epoch_millis).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
        return `<div class="top" style="padding:7px 0; border-bottom:1px solid var(--border)">
          <div>${date}${s.label ? ` <span class="muted">— ${s.label}</span>` : ""}</div>
          <strong style="color:${ok ? "var(--primary)" : "var(--danger)"}">${ok ? "Present" : "Absent"}</strong>
        </div>`;
      }).join("");

  const stat = (label, value) =>
    `<div style="text-align:center; flex:1"><div style="font-size:24px; font-weight:700">${value}</div><div class="muted">${label}</div></div>`;

  panel.innerHTML = `
    <div class="top">
      <h2 style="margin:0">${student.last_name.toUpperCase()} ${student.first_name}</h2>
      <button class="secondary" id="closeStudentStats" style="margin-top:0">Fermer</button>
    </div>
    <div class="muted">${group.activity_name}</div>
    <div class="card" style="display:flex; gap:10px">
      ${stat("Seances", total)}${stat("Present", present)}${stat("Absent", absent)}${stat("Taux", rate + " %")}
    </div>
    <h2 style="margin-top:16px; font-size:15px">Historique</h2>
    ${history}`;

  document.getElementById("closeStudentStats").onclick = () => openUnssGroupDetailPanel(group);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}


/** Redessine ASLVH quand une synchronisation ramene des saisies faites ailleurs. */
globalThis.rafraichirAslvhApresSynchro = async () => {
  if (!document.getElementById("unssList")) return;
  await Promise.all([loadUnssStudents(), loadUnssSlots(), loadUnssGroups()]);
  renderUnssTab();
};
