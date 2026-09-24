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
let unssMode = "licensed"; // "all" | "licensed" | "slots" | "groups" | "appel" | "dates"
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
  // La reponse peut ne pas etre encore revenue quand on entre par un autre chemin que le
  // chargement initial : sans cette attente, l'ecran se dessinait comme si le creneau ne
  // portait rien, et les boutons Eleves / Appel / Bilan manquaient.
  await verifierCreneauPorteTout();
  // Un créneau peut avoir été créé depuis l'application pendant que le site restait ouvert.
  // Relire cette petite table à chaque ouverture de l'onglet évite de conserver l'ancienne
  // liste jusqu'à une synchronisation manuelle ou un rechargement complet.
  if (mode === "slots" || mode === "appel") {
    await verifierAffectationCreneaux();
    await loadUnssSlots();
  }
  if (mode === "dates") await loadUnssDates();
  if (creneauPorteTout && unssInscriptions.length === 0 && unssSeances.length === 0) {
    await loadUnssInscriptions();
  }
  // Cache par defaut dans le HTML : ne le montrer que si la migration n'est pas encore
  // appliquee, plutot que de le retirer apres coup (evite l'apparition breve au chargement).
  const ongletGroupe = document.querySelector('#unssSubtabs [data-unsstab="groups"]');
  if (ongletGroupe) ongletGroupe.style.display = creneauPorteTout ? "none" : "";
  if (creneauPorteTout && unssMode === "groups") unssMode = "slots";
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
let affectationCreneauxActive = false;

async function verifierAffectationCreneaux() {
  try {
    const res = await apiFetch(`${SUPABASE_URL}/rest/v1/eps_schema_marks?name=eq.as_slot_assignments&select=name`);
    affectationCreneauxActive = res.ok && (await res.json()).length > 0;
  } catch { affectationCreneauxActive = false; }
  return affectationCreneauxActive;
}

function peutFaireAppelCreneau(slot) {
  return !affectationCreneauxActive || slot?.assigned_teacher_id === session?.user_id;
}

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

/** Calcule la prochaine occurrence du créneau sans dépendre du planning général. */
function prochaineSeanceCreneau(slot) {
  const jours = { dimanche:0, lundi:1, mardi:2, mercredi:3, jeudi:4, vendredi:5, samedi:6 };
  const cle = String(slot?.day_of_week || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const cible = jours[cle];
  if (cible === undefined) return null;
  const maintenant = new Date();
  let ecart = (cible - maintenant.getDay() + 7) % 7;
  const heure = normaliserHeureCreneau(slot.start_time);
  if (ecart === 0 && heure) {
    const [h, m] = heure.split(":").map(Number);
    if (maintenant.getHours() * 60 + maintenant.getMinutes() >= h * 60 + m) ecart = 7;
  }
  const date = new Date(maintenant);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + ecart);
  return {
    date,
    jour: new Intl.DateTimeFormat("fr-FR", { weekday:"long", day:"numeric", month:"long" }).format(date),
    annee: date.getFullYear()
  };
}

/** Supabase ou une ancienne saisie peuvent rendre HH:MM:SS ; input[type=time] attend HH:MM. */
function normaliserHeureCreneau(valeur) {
  // Accepte les formes deja rencontrees dans les anciennes donnees : 13:00:00, 13h00,
  // 13.00 et 13h. Le formulaire HTML, lui, recoit toujours la forme stricte HH:MM.
  const trouve = String(valeur || "").trim().match(/^(\d{1,2})(?:\s*[:hH.]\s*(\d{2}))?/);
  if (!trouve) return "";
  const heure = Math.min(23, Math.max(0, Number(trouve[1])));
  const minute = Math.min(59, Math.max(0, Number(trouve[2] || 0)));
  return `${String(heure).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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

/**
 * Etape facultative proposee juste apres la creation d'une classe.
 *
 * La classe cible est deja connue : on ne redemande donc pas de la choisir. L'enseignant
 * choisit une division du repertoire, peut retirer quelques eleves, puis verse la selection.
 * La copie vers `students` passe par verserDansClasse(), qui elimine deja les doublons.
 */
async function proposerAjoutElevesApresCreation(classe) {
  const voile = fenetreChoixClasse();
  const corps = voile.querySelector("#classPickBody");
  voile.querySelector("#classPickTitre").textContent = `Classe ${classe.name} créée`;
  corps.innerHTML = `<div class="post-create-class-prompt">
    <span aria-hidden="true">👥</span>
    <h3>Voulez-vous ajouter des élèves maintenant ?</h3>
    <p>Choisissez une division du répertoire, puis gardez toute la division ou seulement certains élèves.</p>
    <div><button id="postClassYes">Ajouter des élèves</button>
    <button class="secondary" id="postClassNo">Plus tard</button></div>
  </div>`;
  voile.classList.add("open");
  corps.querySelector("#postClassNo").addEventListener("click", fermerFenetreChoixClasse);
  corps.querySelector("#postClassYes").addEventListener("click", async () => {
    corps.innerHTML = `<div class="muted">Chargement du répertoire des élèves...</div>`;
    try { await loadUnssStudents(); }
    catch { corps.innerHTML = `<div class="error">Impossible de lire le répertoire des élèves.</div>`; return; }
    afficherChoixDivisionApresCreation(classe, corps);
  });
}

function afficherChoixDivisionApresCreation(classe, corps) {
  const divisions = divisionsConnues(unssStudents);
  if (divisions.length === 0) {
    corps.innerHTML = `<div class="post-create-empty"><b>Aucune division disponible</b>
      <p>Importez d’abord les élèves dans l’onglet Élèves, puis utilisez « Ajouter dans une classe ».</p>
      <button class="secondary" id="postClassDone">Fermer</button></div>`;
    corps.querySelector("#postClassDone").addEventListener("click", fermerFenetreChoixClasse);
    return;
  }
  let division = divisions[0].nom;
  let coches = new Set();
  const dessiner = () => {
    const eleves = trierEleves(elevesDeLaDivision(unssStudents, division));
    corps.innerHTML = `<div class="post-create-students">
      <label>Division<select id="postClassDivision">${divisions.map(d =>
        `<option value="${planningText(d.nom)}"${d.nom === division ? " selected" : ""}>${planningText(d.nom)} (${d.effectif})</option>`
      ).join("")}</select></label>
      <div class="post-create-toolbar"><button class="secondary" id="postClassAll">${eleves.every(e => coches.has(e.id)) ? "Tout décocher" : "Toute la division"}</button>
        <span>${coches.size} élève(s) sélectionné(s)</span></div>
      <div class="post-create-roster">${eleves.map(e => `<label class="${coches.has(e.id) ? "selected" : ""}">
        <input type="checkbox" data-post-student="${e.id}"${coches.has(e.id) ? " checked" : ""}>
        <span><b>${planningText(e.last_name)} ${planningText(e.first_name)}</b>
        <small>${planningText(e.division || "Division non renseignée")} · ${formatFrDate(e.birth_date_epoch_millis) || "Naissance non renseignée"}</small></span>
      </label>`).join("")}</div>
      <div class="post-create-actions"><button id="postClassAdd"${coches.size ? "" : " disabled"}>Ajouter à ${planningText(classe.name)} (${coches.size})</button>
      <button class="secondary" id="postClassCancel">Annuler</button></div>
    </div>`;
    corps.querySelector("#postClassDivision").addEventListener("change", e => {
      division = e.target.value;
      // Une nouvelle division remplace la selection precedente : l'intention ici est de
      // remplir une classe depuis une division, pas de composer plusieurs groupes invisibles.
      coches = new Set();
      dessiner();
    });
    corps.querySelector("#postClassAll").addEventListener("click", () => {
      const tous = eleves.length > 0 && eleves.every(e => coches.has(e.id));
      eleves.forEach(e => { if (tous) coches.delete(e.id); else coches.add(e.id); });
      dessiner();
    });
    corps.querySelectorAll("[data-post-student]").forEach(box => box.addEventListener("change", () => {
      if (box.checked) coches.add(box.dataset.postStudent); else coches.delete(box.dataset.postStudent);
      dessiner();
    }));
    corps.querySelector("#postClassCancel").addEventListener("click", fermerFenetreChoixClasse);
    corps.querySelector("#postClassAdd").addEventListener("click", async () => {
      selectionEleves = new Set(coches);
      await verserDansClasse(classe, corps);
    });
  };
  dessiner();
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
/** Recherche conservee pendant que l'on coche plusieurs eleves successivement. */
let rechercheEleveFiltre = "";

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
  if (unssCibleRendu === "studentsDirectoryList") html += `<th class="eleveActionTitre">Action</th>`;
  html += `</tr></thead><tbody>`;
  eleves.forEach(e => {
    html += `<tr data-eleve="${e.id}"${selectionEleves.has(e.id) ? ' class="choisi"' : ""}>`
      + `<td class="eleveCoche"><input type="checkbox" data-coche="${e.id}"${selectionEleves.has(e.id) ? " checked" : ""}></td>`
      + COLONNES_ELEVE.map(c => `<td>${planningText(c.texte ? c.texte(e) : c.valeur(e))}</td>`).join("")
      + (unssCibleRendu === "studentsDirectoryList"
        ? `<td class="eleveAction"><button type="button" class="student-edit-button" data-directory-edit="${e.id}">✎ Modifier</button></td>`
        : "")
      + `</tr>`;
  });
  return html + `</tbody></table></div>`;
}

/** Page affichee du repertoire. Repart a la premiere des que la liste change de nature. */
let unssPage = 1;
/** Connu avant le rendu : le tableau se construit d'un bloc, il ne peut pas attendre. */
let unssAdmin = false;

/**
 * Telecharger les inscrits a l'AS : Excel (CSV, tableur) ou PDF (aperçu imprimable). Meme
 * choix Excel/PDF que Condition physique, pour ne pas reapprendre un geste different a
 * chaque outil du site.
 */
function showLicenciesExport(rows) {
  document.getElementById("unssExportDialog")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "unssExportDialog";
  overlay.className = "unified-export-overlay";
  overlay.innerHTML = `<section class="unified-export-dialog"><header><i>🏆</i><div><h3>Inscrits à l'AS</h3><p>${rows.length} élève(s)</p></div><button data-export-close>×</button></header><main>
    <h4>Format</h4>
    <button type="button" class="export-choice save" data-format="csv"><b>▦</b><span><strong>Excel</strong><small>Identité, classe, maillot et trois vœux</small></span><em>›</em></button>
    <button type="button" class="export-choice share" data-format="pdf"><b>▤</b><span><strong>PDF</strong><small>Liste complète avec les trois vœux</small></span><em>›</em></button>
    <button class="export-cancel" data-export-close>Annuler</button>
  </main></section>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll("[data-export-close]").forEach(b => b.onclick = () => overlay.remove());
  overlay.onclick = e => { if (e.target === overlay) overlay.remove() };
  overlay.querySelector('[data-format="csv"]').onclick = () => { overlay.remove(); exportLicenciesCsv(rows) };
  overlay.querySelector('[data-format="pdf"]').onclick = () => { overlay.remove(); printLicenciesPdf(rows) };
}

function libelleVoeuExport(student, rang) {
  const texte = student[`wish${rang}`];
  if (texte) return texte;
  const slot = unssSlots.find(s => s.id === student[`wish${rang}_slot_id`]);
  return slot ? unssSlotLabel(slot) : "";
}

function exportLicenciesCsv(rows) {
  const lignes = [["Nom", "Prénom", "Classe / Division", "Taille maillot", "Vœu 1", "Vœu 2", "Vœu 3"],
    ...rows.map(s => [String(s.last_name || "").toUpperCase(), s.first_name || "", s.division || s.school_class_label || s.class_label || "", s.jersey_size || "", libelleVoeuExport(s, 1), libelleVoeuExport(s, 2), libelleVoeuExport(s, 3)])];
  const csv = "\ufeff" + lignes.map(r => r.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `inscrits-as-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function printLicenciesPdf(rows) {
  const w = open("", "_blank");
  if (!w) { alert("Autorisez les fenêtres surgissantes."); return; }
  w.document.write(`<html><head><meta charset=utf-8><title>Inscrits à l'AS</title><style>
    body{font:12px Arial;color:#123a59;padding:24px}
    header{background:#087dca;color:white;padding:18px;border-radius:12px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border:1px solid #cad8e3;padding:6px;text-align:left}
    @page{size:landscape;margin:12mm}
    @media print{button{display:none}}
  </style></head><body>
    <header><h1>Inscrits à l'association sportive</h1><p>${rows.length} élève(s) · ${new Date().toLocaleDateString("fr-FR")}</p></header>
    <table><tr><th>Nom</th><th>Prénom</th><th>Classe / Division</th><th>Taille maillot</th><th>Vœu 1</th><th>Vœu 2</th><th>Vœu 3</th></tr>
    ${rows.map(s => `<tr><td>${unssText(String(s.last_name || "").toUpperCase())}</td><td>${unssText(s.first_name || "")}</td><td>${unssText(s.division || s.school_class_label || s.class_label || "")}</td><td>${unssText(s.jersey_size || "")}</td><td>${unssText(libelleVoeuExport(s, 1))}</td><td>${unssText(libelleVoeuExport(s, 2))}</td><td>${unssText(libelleVoeuExport(s, 3))}</td></tr>`).join("")}
    </table>
    <button onclick="print()">Enregistrer / imprimer en PDF</button>
  </body></html>`);
  w.document.close();
}

/** Exporte la liste du seul créneau affiché, avec les informations utiles au professeur. */
function showCreneauExport(slot, rows) {
  document.getElementById("unssExportDialog")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "unssExportDialog";
  overlay.className = "unified-export-overlay";
  overlay.innerHTML = `<section class="unified-export-dialog"><header><i>${iconeActiviteAS(slot.activity_name)}</i><div><h3>${unssText(slot.activity_name)}</h3><p>${unssText(unssSlotLabel(slot))} · ${rows.length} élève(s)</p></div><button data-export-close>×</button></header><main>
    <h4>Télécharger la liste du créneau</h4>
    <button type="button" class="export-choice save" data-format="csv"><b>▦</b><span><strong>Excel</strong><small>Nom, prénom, classe et catégorie</small></span><em>›</em></button>
    <button type="button" class="export-choice share" data-format="pdf"><b>▤</b><span><strong>PDF</strong><small>Liste prête à imprimer ou enregistrer</small></span><em>›</em></button>
    <button class="export-cancel" data-export-close>Annuler</button>
  </main></section>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll("[data-export-close]").forEach(b => b.onclick = () => overlay.remove());
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.querySelector('[data-format="csv"]').onclick = () => { overlay.remove(); exportCreneauCsv(slot, rows); };
  overlay.querySelector('[data-format="pdf"]').onclick = () => { overlay.remove(); printCreneauPdf(slot, rows); };
}

function exportCreneauCsv(slot, rows) {
  const lignes = [["Nom", "Prénom", "Classe", "Catégorie"], ...rows.map(s => [
    String(s.last_name || "").toUpperCase(), s.first_name || "", s.division || s.school_class_label || s.class_label || "",
    unssCategoryLabel(s.category, s.sex)
  ])];
  const csv = "\ufeff" + lignes.map(r => r.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n");
  const nom = String(slot.activity_name || "creneau-as").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `liste-${nom || "creneau-as"}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function printCreneauPdf(slot, rows) {
  const w = open("", "_blank");
  if (!w) { alert("Autorisez les fenêtres surgissantes."); return; }
  const professeur = slot.responsible_teacher || "Professeur non attribué";
  w.document.write(`<html><head><meta charset=utf-8><title>Liste ${unssText(slot.activity_name)}</title><style>
    body{font:12px Arial;color:#123a59;padding:24px}header{background:#087dca;color:#fff;padding:18px;border-radius:12px}header h1{margin:0 0 6px}header p{margin:3px 0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #cad8e3;padding:7px;text-align:left}th{background:#edf6fd}@media print{button{display:none}}
  </style></head><body><header><h1>${unssText(slot.activity_name)}</h1><p>${unssText(unssSlotLabel(slot))}</p><p>Enseignant : ${unssText(professeur)} · ${rows.length} élève(s)</p></header>
    <table><thead><tr><th>Nom</th><th>Prénom</th><th>Classe</th><th>Catégorie</th></tr></thead><tbody>${rows.map(s => `<tr><td>${unssText(String(s.last_name || "").toUpperCase())}</td><td>${unssText(s.first_name || "")}</td><td>${unssText(s.division || s.school_class_label || s.class_label || "")}</td><td>${unssText(unssCategoryLabel(s.category, s.sex))}</td></tr>`).join("")}</tbody></table><button onclick="print()">Enregistrer / imprimer en PDF</button></body></html>`);
  w.document.close();
}

/** Ceux dont le dossier n'est pas complet, tous ensemble : chaque carte ouvre la fiche pour
 * corriger (encaisser le paiement, recevoir le certificat), sans passer par la liste entiere. */
function ouvrirDocumentsManquants() {
  const panel = document.getElementById("unssPanel");
  ouvrirFenetreUnss();
  const concernes = unssStudents.filter(s => s.licensed && (s.payment_missing || s.medical_certificate_missing))
    .sort((a, b) => String(a.last_name || "").localeCompare(String(b.last_name || ""), "fr"));
  panel.classList.remove("as-full-panel");
  panel.classList.add("as-list-modal");
  panel.innerHTML = `<div class="as-list-modal-head"><div><h2>Documents manquants</h2><small>${concernes.length} élève(s) concerné(s)</small></div><button type="button" id="unssDocsManquantsCloseBtn" aria-label="Fermer">×</button></div>
    <div class="as-list-modal-body">${concernes.length === 0
      ? `<div class="muted">Plus aucun dossier incomplet.</div>`
      : concernes.map(s => `<button type="button" class="as-list-modal-row" data-fiche="${s.id}">
           <div>
             <div><strong>${unssText(String(s.last_name || "").toUpperCase())} ${unssText(s.first_name || "")}</strong></div>
             <small class="missing">${[s.payment_missing ? "⚠ Paiement manquant" : "", s.medical_certificate_missing ? "⚠ Certificat manquant" : ""].filter(Boolean).join(" · ")}</small>
           </div>
           <b>›</b></button>`).join("")
    }</div>`;
  panel.querySelectorAll("[data-fiche]").forEach(el => el.addEventListener("click", () => {
    const student = unssStudents.find(s => s.id === el.dataset.fiche);
    if (student) openUnssStudentPanel(student, true);
  }));
  document.getElementById("unssDocsManquantsCloseBtn").addEventListener("click", () => fermerFenetreUnss());
}

/** Les familles qui ont propose d'heberger, pour organiser un deplacement (competition, sortie).
 * Chaque carte ouvre la fiche pour voir/corriger la capacite, l'age et le sexe souhaites. */
function ouvrirHebergement() {
  const panel = document.getElementById("unssPanel");
  ouvrirFenetreUnss();
  const concernes = unssStudents.filter(s => s.licensed && s.host_available)
    .sort((a, b) => String(a.last_name || "").localeCompare(String(b.last_name || ""), "fr"));
  panel.classList.remove("as-full-panel");
  panel.classList.add("as-list-modal");
  panel.innerHTML = `<div class="as-list-modal-head"><div><h2>Hébergement</h2><small>${concernes.length} famille(s) disponible(s)</small></div><button type="button" id="unssHebergementCloseBtn" aria-label="Fermer">×</button></div>
    <div class="as-list-modal-body">${concernes.length === 0
      ? `<div class="muted">Aucune famille n'a proposé d'héberger pour l'instant.</div>`
      : concernes.map(s => `<button type="button" class="as-list-modal-row" data-fiche="${s.id}">
           <div>
             <div><strong>${unssText(String(s.last_name || "").toUpperCase())} ${unssText(s.first_name || "")}</strong></div>
             <small class="identity-meta">${unssText(s.division || s.school_class_label || s.class_label || "Classe non renseignée")} · ${unssText(unssCategoryLabel(s.category, s.sex))}</small>
             <small>🏠${s.host_capacity ? ` ${s.host_capacity} place(s)` : ""}${s.host_age_min || s.host_age_max ? ` · ${s.host_age_min || "?"}-${s.host_age_max || "?"} ans` : ""}${s.host_sex_pref ? ` · ${s.host_sex_pref === "F" ? "filles" : "garçons"}` : ""}</small>
           </div>
           <b>›</b></button>`).join("")
    }</div>`;
  panel.querySelectorAll("[data-fiche]").forEach(el => el.addEventListener("click", () => {
    const student = unssStudents.find(s => s.id === el.dataset.fiche);
    if (student) openUnssStudentPanel(student, true);
  }));
  document.getElementById("unssHebergementCloseBtn").addEventListener("click", () => fermerFenetreUnss());
}

function renderUnssTab() {
  if (unssMode === "slots") { renderUnssSlotsTab(); return; }
  if (unssMode === "groups") { renderUnssGroupsTab(); return; }
  if (unssMode === "appel") { renderUnssAppelTab(); return; }
  if (unssMode === "dates") { renderUnssDatesTab(); return; }
  const wrap = document.getElementById(unssCibleRendu);
  if (!wrap) return;
  // Liste eleve se lit en tableau : on y cherche une division entiere, pas une fiche.
  // Licencies AS garde ses cartes, ou l'on consulte les voeux et la taille de maillot.
  const enTableau = unssCibleRendu === "listeEleveList" || unssCibleRendu === "studentsDirectoryList";
  const brut = unssMode === "licensed" ? unssStudents.filter(s => s.licensed) : unssStudents;
  // Le filtre par division n'a de sens que sur le tableau : c'est la qu'on vient chercher une
  // classe entiere. Une division disparue du repertoire ne doit pas laisser un tableau vide.
  const divisions = enTableau ? divisionsConnues(brut) : [];
  if (divisionFiltre && !divisions.some(d => d.nom === divisionFiltre)) divisionFiltre = "";
  const parDivision = enTableau && divisionFiltre ? elevesDeLaDivision(brut, divisionFiltre) : brut;
  const rechercheNormalisee = chaineRecherche(rechercheEleveFiltre);
  const filtres = rechercheNormalisee
    ? parDivision.filter(e => chaineRecherche(`${e.last_name || ""} ${e.first_name || ""}`).includes(rechercheNormalisee))
    : parDivision;
  const rows = enTableau ? trierEleves(filtres) : filtres;
  const totalPages = Math.max(1, Math.ceil(rows.length / TAILLE_PAGE_LISTE));
  // Supprimer des eleves peut faire disparaitre la page courante sous les pieds.
  if (unssPage > totalPages) unssPage = totalPages;
  const debutPage = (unssPage - 1) * TAILLE_PAGE_LISTE;
  const rowsPage = rows.slice(debutPage, debutPage + TAILLE_PAGE_LISTE);
  let html = "";
  // Verser une classe entiere : on choisit sa division, puis on coche tout d'un geste. Sans
  // cela il fallait cliquer les eleves un par un, et une page de cent en melange plusieurs.
  if (enTableau) {
    const tousChoisis = rows.length > 0 && rows.every(e => selectionEleves.has(e.id));
    html += `<div class="student-directory-filters">
      <label class="student-directory-search">🔎<input id="rechercheEleveRepertoire" value="${planningText(rechercheEleveFiltre)}" placeholder="Rechercher un nom ou un prénom"></label>
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
  html += `<div style="display:flex; justify-content:flex-end; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap">`;
  // Recherche par nom/prenom : deja disponible sur la liste complete (filtres au-dessus), mais
  // absente des vues en cartes (Licencies AS, Tous les eleves) faute de place dans la barre.
  // Retrouver un licencie precis sans faire defiler toute la page.
  if (!enTableau) {
    html += `<label class="student-directory-search" style="flex:0 1 220px; margin-right:auto">🔎<input id="rechercheEleveRepertoire" value="${planningText(rechercheEleveFiltre)}" placeholder="Rechercher un nom ou un prénom"></label>`;
  }
  // Importer, ajouter et supprimer sont reserves a l'administrateur : ces actions touchent le
  // repertoire de tout l'etablissement. Corriger une fiche reste ouvert a chacun.
  // Un import CSV cree ou complete des fiches du repertoire general : il n'a pas sa place sur
  // Licencies AS, qui n'en est qu'un sous-ensemble filtre.
  if ((unssAdmin || unssCibleRendu === "studentsDirectoryList") && unssMode !== "licensed") {
    html += `<button class="secondary" id="unssImportBtn" style="margin-top:0">Importer CSV</button>`;
  }
  // Vider le repertoire n'a de sens que sur la liste complete : depuis Licencies AS on ne
  // verrait pas ce qu'on supprime, puisque les licencies sont justement ce qui est preserve.
  if (unssAdmin && unssMode !== "licensed" && rows.length > 0) {
    html += `<button class="secondary" id="unssClearBtn" style="margin-top:0">Supprimer toute la liste</button>`;
  }
  // Licencier un eleve ne cree personne : cela coche un eleve deja present, et reste ouvert.
  if (unssAdmin || unssMode === "licensed" || unssCibleRendu === "studentsDirectoryList") {
    html += `<button id="unssAddBtn" style="margin-top:0">${unssMode === "licensed" ? "Licencier un eleve" : "Ajouter un élève"}</button>`;
  }
  // Retrouver d'un coup ceux dont le dossier n'est pas complet (paiement ou certificat manquant),
  // sans avoir a rouvrir chaque fiche pour le voir.
  if (unssMode === "licensed" && rows.some(s => s.payment_missing || s.medical_certificate_missing)) {
    html += `<button class="secondary" id="unssDocsManquantsBtn" style="margin-top:0">Document manquant</button>`;
  }
  // Retrouver d'un coup les familles qui ont propose d'heberger, pour un deplacement a organiser.
  if (unssMode === "licensed" && rows.some(s => s.host_available)) {
    html += `<button class="secondary" id="unssHebergementBtn" style="margin-top:0">Hébergement</button>`;
  }
  // Telecharger la liste des inscrits : nom, prenom, classe/division, taille de maillot -
  // ce qu'on redonne au secretariat ou au club en fin d'annee.
  if (unssMode === "licensed" && rows.length > 0) {
    html += `<button class="secondary" id="unssExportBtn" style="margin-top:0">Télécharger</button>`;
  }
  // Verser une selection dans une classe : c'est le geste que le tableau doit rendre facile.
  if (enTableau) {
    html += `<button id="eleveVersClasseBtn" style="margin-top:0" ${selectionEleves.size ? "" : "disabled"}>`
      + `Ajouter dans une classe${selectionEleves.size ? ` (${selectionEleves.size})` : ""}</button>`;
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
          ${unssMode === "licensed" && s.host_available ? `<div class="muted" style="font-size:12px">🏠 Peut héberger${s.host_capacity ? ` (${s.host_capacity})` : ""}${s.host_age_min || s.host_age_max ? ` · ${s.host_age_min || "?"}-${s.host_age_max || "?"} ans` : ""}${s.host_sex_pref ? ` · ${s.host_sex_pref === "F" ? "filles" : "garçons"}` : ""}</div>` : ""}
          ${unssMode === "licensed" && (s.payment_missing || s.medical_certificate_missing) ? `<div style="font-size:12px; color:#B3261E; font-weight:600">${[s.payment_missing ? "⚠ Paiement manquant" : "", s.medical_certificate_missing ? "⚠ Certificat manquant" : ""].filter(Boolean).join(" · ")}</div>` : ""}
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
  wrap.querySelectorAll("[data-directory-edit]").forEach(btn => btn.addEventListener("click", e => {
    e.stopPropagation();
    const student = unssStudents.find(s => s.id === btn.dataset.directoryEdit);
    if (student) openUnssStudentPanel(student, false, true);
  }));
  wrap.querySelector("#unssExportBtn")?.addEventListener("click", () => showLicenciesExport(rows));
  wrap.querySelector("#unssDocsManquantsBtn")?.addEventListener("click", () => ouvrirDocumentsManquants());
  wrap.querySelector("#unssHebergementBtn")?.addEventListener("click", () => ouvrirHebergement());
  const choixDivision = wrap.querySelector("#filtreDivision");
  if (choixDivision) choixDivision.addEventListener("change", () => {
    // Changer de division ne touche pas aux coches deja posees : on peut composer une classe
    // a partir de deux divisions sans repartir de zero.
    divisionFiltre = choixDivision.value;
    unssPage = 1;
    renderUnssTab();
  });
  const rechercheEleve = wrap.querySelector("#rechercheEleveRepertoire");
  if (rechercheEleve) rechercheEleve.addEventListener("input", () => {
    rechercheEleveFiltre = rechercheEleve.value;
    unssPage = 1;
    // Conserver le focus et le curseur pendant le redessin complet de la liste.
    const position = rechercheEleve.selectionStart;
    renderUnssTab();
    const nouveau = document.getElementById("rechercheEleveRepertoire");
    nouveau?.focus();
    nouveau?.setSelectionRange(position, position);
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
  if (addBtn) addBtn.addEventListener("click", async () => {
    if (unssMode === "licensed") openUnssPickPanel();
    else if (await autoriserGestionRepertoire())
      openUnssStudentPanel(null, false, unssCibleRendu === "studentsDirectoryList");
  });
  const importBtn = document.getElementById("unssImportBtn");
  if (importBtn) importBtn.addEventListener("click", async () => {
    if (await autoriserGestionRepertoire()) unssFileInput().click();
  });
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
 * Les boutons restent visibles dans le repertoire : si le contrôle du profil a échoué, les
 * faire disparaître ressemble à une suppression de fonction. Au clic, on relit les droits et
 * on explique clairement un refus réel. La base conserve dans tous les cas le dernier mot.
 */
async function autoriserGestionRepertoire() {
  const autorise = await estAdministrateur(true);
  unssAdmin = autorise;
  if (autorise) return true;
  alert("L’import CSV et l’ajout manuel sont réservés à l’administrateur de l’établissement. Si vous êtes administrateur, vérifiez la connexion puis réessayez.");
  return false;
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
  rapport.affectations = await analyserChangementsDeDivision(rapport);
  importEnCours = rapport;
  choixDivergences = {};
  choixAmbigus = {};
  choixAffectations = {};
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
let choixAffectations = {};  // index reconnu -> conserver, deplacer, retirer ou ajouter

function divisionVersClasse(division) {
  const brut = ImportEleves.texteNormalise(division).replace(/\s+/g, "");
  const morceaux = brut.match(/^(6|5|4|3|2|1|t)(?:e|eme|nde|ere|le)?[.\-_]?(\d{1,2})$/i);
  if (!morceaux) return null;
  const grades = { "6": "SIXIEME", "5": "CINQUIEME", "4": "QUATRIEME", "3": "TROISIEME",
    "2": "SECONDE", "1": "PREMIERE", t: "TERMINALE" };
  return { grade: grades[morceaux[1].toLowerCase()], numero: Number(morceaux[2]) };
}

function memeEleveDeClasse(repertoire, eleve) {
  return ImportEleves.texteNormalise(repertoire.last_name) === ImportEleves.texteNormalise(eleve.last_name)
    && ImportEleves.texteNormalise(repertoire.first_name) === ImportEleves.texteNormalise(eleve.first_name)
    && (ImportEleves.estVide(repertoire.birth_date_epoch_millis)
      || ImportEleves.estVide(eleve.birth_date_epoch_millis)
      || ImportEleves.memeValeur("birth_date_epoch_millis", repertoire.birth_date_epoch_millis,
        eleve.birth_date_epoch_millis));
}

/** Prepare les propositions, sans changer la moindre affectation. */
async function analyserChangementsDeDivision(rapport) {
  const changements = rapport.reconnus.map((reconnu, index) => ({ reconnu, index,
    divergence: reconnu.divergences.find(d => d.champ === "division") })).filter(x => x.divergence);
  if (!changements.length) return [];
  try {
    const [classesRes, elevesRes] = await Promise.all([
      apiFetchAll(`${SUPABASE_URL}/rest/v1/classes?deleted=eq.false&select=id,name,grade,class_number`),
      apiFetchAll(`${SUPABASE_URL}/rest/v1/students?deleted=eq.false&select=*`)
    ]);
    if (!classesRes.ok || !elevesRes.ok) return [];
    const classes = classesRes.rows;
    return changements.map(({ reconnu, index, divergence }) => {
      const correspondance = divisionVersClasse(divergence.nouvelle);
      const destinations = correspondance ? classes.filter(c =>
        baseSchoolLevel(c.grade) === correspondance.grade && Number(c.class_number) === correspondance.numero) : [];
      const fiches = elevesRes.rows.filter(e => memeEleveDeClasse(reconnu.existant, e));
      const classeParId = new Map(classes.map(c => [c.id, c]));
      return { index, eleve: reconnu.existant, ancienne: divergence.ancienne, nouvelle: divergence.nouvelle,
        fiches, classesActuelles: [...new Set(fiches.map(e => classeParId.get(e.class_id)?.name).filter(Boolean))],
        destination: destinations.length === 1 ? destinations[0] : null,
        destinationAmbigue: destinations.length > 1 };
    }).filter(a => a.fiches.length || a.destination);
  } catch { return []; }
}

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

  if (r.affectations?.length) {
    html += `<div class="card" style="margin-top:12px">
      <h3 style="margin:0 0 4px">Affectation dans vos classes EPS</h3>
      <div class="muted">Ces actions ne seront appliquées que si vous retenez la nouvelle division du fichier.</div>`;
    r.affectations.forEach(a => {
      const choix = choixAffectations[a.index] || "conserver";
      const actuelle = a.classesActuelles.length ? a.classesActuelles.join(", ") : "aucune classe EPS";
      html += `<div class="card" style="margin-top:8px">
        <strong>${planningText(nomComplet(a.eleve))}</strong>
        <div class="muted">Division ${planningText(a.ancienne || "inconnue")} → ${planningText(a.nouvelle)} · Classe actuelle : ${planningText(actuelle)}</div>
        <label style="display:block;margin-top:7px"><input type="radio" name="aff-${a.index}" value="conserver" data-affectation="${a.index}" ${choix === "conserver" ? "checked" : ""}> Conserver l’affectation actuelle</label>`;
      if (a.fiches.length === 1 && a.destination && a.fiches[0].class_id !== a.destination.id) {
        html += `<label style="display:block"><input type="radio" name="aff-${a.index}" value="deplacer" data-affectation="${a.index}" ${choix === "deplacer" ? "checked" : ""}> Déplacer vers ${planningText(a.destination.name)}</label>`;
      } else if (!a.fiches.length && a.destination) {
        html += `<label style="display:block"><input type="radio" name="aff-${a.index}" value="ajouter" data-affectation="${a.index}" ${choix === "ajouter" ? "checked" : ""}> Ajouter à ${planningText(a.destination.name)}</label>`;
      }
      if (a.fiches.length) html += `<label style="display:block"><input type="radio" name="aff-${a.index}" value="retirer" data-affectation="${a.index}" ${choix === "retirer" ? "checked" : ""}> Retirer de ${planningText(actuelle)}</label>`;
      if (!a.destination && !a.destinationAmbigue) html += `<div class="muted" style="margin-top:6px">Aucune classe EPS ${planningText(a.nouvelle)} n’existe actuellement.</div>`;
      if (a.destinationAmbigue) html += `<div class="error" style="margin-top:6px">Plusieurs classes correspondent à ${planningText(a.nouvelle)} : affectation conservée.</div>`;
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
  wrap.querySelectorAll("[data-affectation]").forEach(radio => radio.addEventListener("change", () => {
    choixAffectations[radio.dataset.affectation] = radio.value;
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
  // La page peut rester ouverte pendant qu'une synchronisation mobile actualise une fiche.
  // On garde l'etat qui a servi au rapprochement afin de ne reporter ensuite que les apports
  // du fichier sur la version la plus recente de chaque eleve.
  const basesParId = new Map();
  const ajouter = (fiche, existant) => {
    const complete = preparer(fiche, existant);
    if (existant?.id) basesParId.set(existant.id, existant);
    aEnvoyer.push(complete);
  };
  r.reconnus.forEach((reconnu, index) => {
    const choix = {};
    reconnu.divergences.forEach(d => {
      if (choixDivergences[`${index}|${d.champ}`] === "nouvelle") choix[d.champ] = "nouvelle";
    });
    const fiche = ImportEleves.ficheFusionnee(reconnu, choix);
    if (reconnu.aCompleter.length === 0 && Object.keys(choix).length === 0) return; // rien a ecrire
    ajouter(fiche, reconnu.existant);
  });

  r.ambigus.forEach((cas, index) => {
    const decision = choixAmbigus[index];
    if (!decision) return;                                    // ignore, comme annonce
    if (decision === "nouveau") {
      ajouter({ ...cas.importe, id: crypto.randomUUID() }, null);
      return;
    }
    const existant = cas.candidats.find(c => c.id === decision);
    if (!existant) return;
    const reconnu = { existant, importe: cas.importe,
      aCompleter: ImportEleves.CHAMPS
        .filter(([champ]) => !ImportEleves.estVide(cas.importe[champ]) && ImportEleves.estVide(existant[champ]))
        .map(([champ]) => ({ champ, valeur: cas.importe[champ] })),
      divergences: [] };
    ajouter(ImportEleves.ficheFusionnee(reconnu), existant);
  });

  r.nouveaux.forEach(nouveau => {
    ajouter({ ...nouveau, id: crypto.randomUUID() }, null);
  });

  /** Recharge le lot et reporte seulement les apports de cet import sur les fiches recentes. */
  async function lotSurVersionsRecentes(lot) {
    const ids = lot.filter(fiche => basesParId.has(fiche.id)).map(fiche => fiche.id);
    if (!ids.length) return lot;
    const lecture = await apiFetchAll(`${SUPABASE_URL}/rest/v1/unss_students?id=in.(${ids.map(encodeURIComponent).join(",")})&select=*`);
    if (!lecture.ok) throw new Error("Impossible d'actualiser les fiches avant l'import.");
    const recentes = new Map(lecture.rows.map(fiche => [fiche.id, fiche]));
    return lot.map(fiche => {
      const base = basesParId.get(fiche.id);
      const recente = recentes.get(fiche.id);
      if (!base || !recente) return fiche;
      const fusion = { ...recente };
      for (const [champ] of ImportEleves.CHAMPS) {
        if (!ImportEleves.memeValeur(champ, fiche[champ], base[champ])) fusion[champ] = fiche[champ];
      }
      if (fiche.licensed && !base.licensed) fusion.licensed = true;
      fusion.category = computeUnssCategory(fusion.birth_date_epoch_millis, schoolYear);
      fusion.updated_at = new Date().toISOString();
      fusion.deleted = false;
      return fusion;
    });
  }

  async function appliquerAffectationsDeClasse() {
    for (const affectation of r.affectations || []) {
      if (choixDivergences[`${affectation.index}|division`] !== "nouvelle") continue;
      const decision = choixAffectations[affectation.index] || "conserver";
      if (decision === "conserver") continue;
      if (decision === "deplacer" && affectation.fiches.length === 1 && affectation.destination) {
        const ficheRes = await apiFetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${encodeURIComponent(affectation.fiches[0].id)}&select=*`);
        const [ficheRecente] = ficheRes.ok ? await ficheRes.json() : [];
        if (!ficheRecente) throw new Error(`Impossible de retrouver ${nomComplet(affectation.eleve)} dans son ancienne classe.`);
        await apiFetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${encodeURIComponent(ficheRecente.id)}`, {
          method: "PATCH", body: JSON.stringify({ ...ficheRecente, class_id: affectation.destination.id,
            updated_at: new Date().toISOString() })
        });
      } else if (decision === "retirer" && affectation.fiches.length) {
        for (const ancienneFiche of affectation.fiches) {
          const ficheRes = await apiFetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${encodeURIComponent(ancienneFiche.id)}&select=*`);
          const [ficheRecente] = ficheRes.ok ? await ficheRes.json() : [];
          if (ficheRecente) await apiFetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${encodeURIComponent(ficheRecente.id)}`, {
            method: "PATCH", body: JSON.stringify({ ...ficheRecente, deleted: true, updated_at: new Date().toISOString() })
          });
        }
      } else if (decision === "ajouter" && affectation.destination) {
        const reconnu = r.reconnus[affectation.index];
        const choix = {};
        reconnu.divergences.forEach(d => {
          if (choixDivergences[`${affectation.index}|${d.champ}`] === "nouvelle") choix[d.champ] = "nouvelle";
        });
        const source = ImportEleves.ficheFusionnee(reconnu, choix);
        const dejaRes = await apiFetchAll(`${SUPABASE_URL}/rest/v1/students?deleted=eq.false&class_id=eq.${encodeURIComponent(affectation.destination.id)}&select=*`);
        if (!dejaRes.rows.some(e => memeEleveDeClasse(source, e))) {
          await apiFetch(`${SUPABASE_URL}/rest/v1/students`, { method: "POST", body: JSON.stringify({
            id: crypto.randomUUID(), class_id: affectation.destination.id, user_id: session.user_id,
            last_name: source.last_name, first_name: source.first_name,
            birth_date_epoch_millis: source.birth_date_epoch_millis || null,
            sex: sexFromValue(source.sex) || "NON_PRECISE", eps_level: "3",
            student_email: source.student_email || null, parent1_email: source.parent_email || null,
            updated_at: new Date().toISOString(), deleted: false
          }) });
        }
      }
    }
  }

  let envoyes = 0;
  const TAILLE_LOT = 200;
  try {
    for (let i = 0; i < aEnvoyer.length; i += TAILLE_LOT) {
      const originaux = aEnvoyer.slice(i, i + TAILLE_LOT);
      const lot = await lotSurVersionsRecentes(originaux);
      const nouveaux = lot.filter(fiche => !basesParId.has(fiche.id));
      const existants = lot.filter(fiche => basesParId.has(fiche.id));

      // Un POST avec resolution=merge-duplicates passe d'abord par le declencheur INSERT, qui
      // remet la version a 1 avant l'UPDATE. Toute fiche deja en version 2 ou plus est alors
      // refusee. Les nouvelles fiches restent groupees, les existantes passent par PATCH.
      if (nouveaux.length) {
        const aCreer = nouveaux.map(({ version, ...fiche }) => fiche);
        await apiFetch(`${SUPABASE_URL}/rest/v1/unss_students`, {
          method: "POST", body: JSON.stringify(aCreer)
        });
        envoyes += nouveaux.length;
      }

      // Douze mises a jour simultanees gardent l'import fluide sans envoyer plusieurs centaines
      // de requetes d'un seul coup a Supabase.
      for (let debut = 0; debut < existants.length; debut += 12) {
        const tranche = existants.slice(debut, debut + 12);
        await Promise.all(tranche.map(async fiche => {
          const original = originaux.find(x => x.id === fiche.id) || fiche;
          try {
            await apiFetch(`${SUPABASE_URL}/rest/v1/unss_students?id=eq.${encodeURIComponent(fiche.id)}`, {
              method: "PATCH", body: JSON.stringify(fiche)
            });
          } catch (e) {
            if (!/HTTP 409|Version perimee/i.test(String(e.message || e))) throw e;
            const [actualisee] = await lotSurVersionsRecentes([original]);
            await apiFetch(`${SUPABASE_URL}/rest/v1/unss_students?id=eq.${encodeURIComponent(fiche.id)}`, {
              method: "PATCH", body: JSON.stringify(actualisee)
            });
          }
        }));
        envoyes += tranche.length;
      }
    }
    await appliquerAffectationsDeClasse();
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
      // Le creneau porte ses eleves, ses appels et son bilan : les trois actions sont ici, la
      // ou l'on vient de creer l'activite, au lieu d'un onglet Groupe separe a re-saisir.
      const inscrits = creneauPorteTout ? elevesDuCreneau(slot.id).length : 0;
      const actions = creneauPorteTout
        ? `<button class="secondary" data-slot-eleves="${slot.id}" style="margin-top:0">Élèves (${inscrits})</button>
           <button class="secondary" data-slot-appel="${slot.id}" style="margin-top:0">Appel</button>
           <button class="secondary" data-slot-bilan="${slot.id}" style="margin-top:0">Bilan</button>
           <button class="secondary as-slot-download" data-slot-export="${slot.id}" style="margin-top:0">⇩ Télécharger</button>`
        : "";
      return `<div class="as-slot-entry"><button class="as-slot-tile" data-slot="${slot.id}">
        <span class="as-sport-icon">${iconeActiviteAS(slot.activity_name)}</span>
        <span><strong>${unssText(slot.activity_name || "Créneau sans nom")}</strong>
        <small>⌖ ${unssText(slot.location || "Lieu non renseigné")} · ◷ ${unssText(detail) || "Horaire non renseigné"}</small>
        <small>👤 ${unssText(slot.responsible_teacher || "Professeur non attribué")}</small>
        <small>${inscrits} inscrit(s) · ${demandes} vœu(x)${places}</small></span><b>›</b></button><div class="as-slot-actions">${actions}</div></div>`;
    }).join("");
  }
  wrap.innerHTML = html;

  document.getElementById("unssSlotAddBtn").addEventListener("click", () => openUnssSlotPanel(null));
  wrap.querySelectorAll("[data-slot]").forEach(el => {
    el.addEventListener("click", () => ouvrirFicheCreneau(unssSlots.find(x => x.id === el.dataset.slot)));
  });
  wrap.querySelectorAll("[data-slot-delete]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await supprimerCreneau(btn.dataset.slotDelete);
    });
  });
  const creneauDe = id => unssSlots.find(x => x.id === id);
  wrap.querySelectorAll("[data-slot-eleves]").forEach(btn => btn.addEventListener("click", e => {
    e.stopPropagation(); ouvrirElevesCreneau(creneauDe(btn.dataset.slotEleves));
  }));
  wrap.querySelectorAll("[data-slot-bilan]").forEach(btn => btn.addEventListener("click", e => {
    e.stopPropagation(); ouvrirBilanCreneau(creneauDe(btn.dataset.slotBilan));
  }));
  wrap.querySelectorAll("[data-slot-export]").forEach(btn => btn.addEventListener("click", e => {
    e.stopPropagation();
    const slot = creneauDe(btn.dataset.slotExport);
    if (slot) showCreneauExport(slot, elevesDuCreneau(slot.id));
  }));
  wrap.querySelectorAll("[data-slot-appel]").forEach(btn => btn.addEventListener("click", e => {
    e.stopPropagation();
    unssAppelSlotId = btn.dataset.slotAppel;
    showUnssTab("appel");
  }));
}

function iconeActiviteAS(nom) {
  const n = String(nom || "").toLowerCase();
  if (n.includes("bad")) return "🏸"; if (n.includes("basket")) return "🏀";
  if (n.includes("foot")) return "⚽"; if (n.includes("volley")) return "🏐";
  if (n.includes("escal")) return "🧗"; if (n.includes("natation") || n.includes("sauvetage")) return "🏊";
  if (n.includes("vélo") || n.includes("vtt") || n.includes("route")) return "🚴";
  if (n.includes("athl") || n.includes("course")) return "🏃"; if (n.includes("danse")) return "💃";
  if (n.includes("gym")) return "🤸"; if (n.includes("pad")) return "🎾"; if (n.includes("aquathlon")) return "🏊‍♂️";
  return "🏆";
}

function emailsAS(value) {
  return [...new Set(String(value || "").split(/[;,\s]+/).map(v => v.trim().toLowerCase())
    .filter(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)))];
}

function lirePieceJointeAS(file) {
  if (!file) return Promise.resolve(null);
  const autorises = ["application/pdf", "image/png", "image/jpeg"];
  if (!autorises.includes(file.type)) throw new Error("La pièce jointe doit être un PDF, une image PNG ou JPEG.");
  if (file.size > 3 * 1024 * 1024) throw new Error("La pièce jointe ne doit pas dépasser 3 Mo.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Impossible de lire la pièce jointe."));
    reader.onload = () => resolve({ name: file.name, type: file.type, content: String(reader.result || "").split(",")[1] || "" });
    reader.readAsDataURL(file);
  });
}

/** Fenêtre d'envoi confidentiel aux inscrits d'un créneau. Le serveur relit lui-même le créneau
 * et ses inscriptions : le navigateur ne décide jamais seul des destinataires. */
async function ouvrirEmailCreneau(slot) {
  await assurerInscriptions();
  const eleves = elevesDuCreneau(slot.id);
  document.getElementById("asSlotEmailOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "asSlotEmailOverlay";
  overlay.className = "as-slot-email-overlay";
  overlay.innerHTML = `<section class="as-slot-email-dialog" role="dialog" aria-modal="true" aria-labelledby="asEmailTitle">
    <header><div><small>CRÉNEAU AS</small><h2 id="asEmailTitle">Envoyer un e-mail</h2><p>${unssText(slot.activity_name)} · ${unssText(unssSlotLabel(slot))}</p></div><button type="button" data-email-close aria-label="Fermer">×</button></header>
    <main>
      <details open><summary>1. Destinataires</summary><div class="as-email-section">
        <label class="as-email-choice"><input type="radio" name="asEmailAudience" value="students" checked><span><b>Aux élèves</b><small>Adresse e-mail de chaque élève</small></span></label>
        <label class="as-email-choice"><input type="radio" name="asEmailAudience" value="parents"><span><b>Aux parents</b><small>Adresses parentales, envois confidentiels</small></span></label>
        <label class="as-email-choice"><input type="radio" name="asEmailAudience" value="both"><span><b>Aux élèves et aux parents</b><small>Personne ne voit les autres adresses</small></span></label>
        <label class="as-email-choice"><input type="radio" name="asEmailAudience" value="parents_personalized"><span><b>Message personnalisé aux parents</b><small>Un e-mail par enfant avec son nom</small></span></label>
        <div class="as-email-recipient-summary" id="asEmailRecipientSummary"></div>
      </div></details>
      <details open><summary>2. Message</summary><div class="as-email-section">
        <label>Modèle<select id="asEmailTemplate"><option value="confirmation">Confirmation d’inscription</option><option value="cancellation">Séance annulée</option><option value="information">Information importante</option><option value="free">Message libre</option></select></label>
        <label id="asEmailDateLine" hidden>Date de la séance annulée<input id="asEmailDate" type="date"></label>
        <label>Objet<input id="asEmailSubject" maxlength="180"></label>
        <label>Message<textarea id="asEmailMessage" rows="9" maxlength="8000"></textarea></label>
        <p class="as-email-help">Les champs {prenom}, {nom} et {enfant} sont remplacés automatiquement pour les envois personnalisés.</p>
      </div></details>
      <details><summary>3. Pièce jointe facultative</summary><div class="as-email-section"><label>Document de confirmation, PDF ou image (3 Mo maximum)<input id="asEmailAttachment" type="file" accept="application/pdf,image/png,image/jpeg"></label></div></details>
      <div class="as-email-result" id="asEmailResult"></div>
    </main>
    <footer><button type="button" class="secondary" data-email-close>Annuler</button><button type="button" id="asEmailSend">Envoyer</button></footer>
  </section>`;
  document.body.appendChild(overlay);

  const heure = [slot.start_time, slot.end_time].filter(Boolean).join("–") || "horaire à préciser";
  const jour = capitaliseJour(slot.day_of_week || "");
  const professeur = slot.responsible_teacher || "Le professeur EPS";
  const audience = () => overlay.querySelector('input[name="asEmailAudience"]:checked').value;
  const compteur = mode => {
    const adresses = new Set(), manquants = [];
    eleves.forEach(e => {
      const mailsEleve = emailsAS(e.student_email);
      const mailsParent = emailsAS(e.parent_email);
      const mails = mode === "students" ? mailsEleve : mode === "parents" || mode === "parents_personalized" ? mailsParent : [...mailsEleve, ...mailsParent];
      if (!mails.length) manquants.push(`${String(e.last_name || "").toUpperCase()} ${e.first_name || ""}`.trim());
      mails.forEach(m => adresses.add(mode === "parents_personalized" ? `${e.id}|${m}` : m));
    });
    return { nombre: adresses.size, manquants };
  };
  const actualiserDestinataires = () => {
    const c = compteur(audience());
    const manque = c.manquants.length ? `<span>${c.manquants.length} sans adresse : ${unssText(c.manquants.slice(0, 4).join(", "))}${c.manquants.length > 4 ? "…" : ""}</span>` : `<span class="ok">Toutes les adresses nécessaires sont renseignées.</span>`;
    overlay.querySelector("#asEmailRecipientSummary").innerHTML = `<b>${c.nombre} e-mail(s) seront envoyés séparément</b>${manque}`;
  };
  const appliquerModele = () => {
    const mode = overlay.querySelector("#asEmailTemplate").value;
    const typeDestinataire = audience();
    const dateInput = overlay.querySelector("#asEmailDate");
    overlay.querySelector("#asEmailDateLine").hidden = mode !== "cancellation";
    const date = dateInput.value ? new Date(`${dateInput.value}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "[date à sélectionner]";
    let objet = "", message = "";
    if (mode === "confirmation") {
      objet = `Confirmation d’inscription – ${slot.activity_name}`;
      message = typeDestinataire === "parents_personalized"
        ? `Bonjour,\n\nVotre enfant {enfant} est retenu(e) dans l’activité ${slot.activity_name} du ${jour} de ${heure}.\n\nCordialement,\n${professeur}`
        : typeDestinataire === "students"
          ? `Bonjour {prenom},\n\nCe message vous confirme que vous êtes retenu(e) dans l’activité ${slot.activity_name} du ${jour} de ${heure}.\n\nCordialement,\n${professeur}`
          : `Bonjour,\n\nCe message confirme l’inscription de l’élève concerné(e) dans l’activité ${slot.activity_name} du ${jour} de ${heure}.\n\nCordialement,\n${professeur}`;
    } else if (mode === "cancellation") {
      objet = `Séance d’AS ${slot.activity_name} annulée – ${date}`;
      message = `Bonjour,\n\nLa séance d’AS ${slot.activity_name} du ${date}, prévue de ${heure}, est annulée.\n\nCordialement,\n${professeur}`;
    } else if (mode === "information") {
      objet = `Information AS – ${slot.activity_name}`;
      message = `Bonjour,\n\nNous vous transmettons une information concernant l’activité ${slot.activity_name} du ${jour} de ${heure} :\n\n[Votre information]\n\nCordialement,\n${professeur}`;
    }
    overlay.querySelector("#asEmailSubject").value = objet;
    overlay.querySelector("#asEmailMessage").value = message;
  };
  overlay.querySelectorAll("[data-email-close]").forEach(b => b.onclick = () => overlay.remove());
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.querySelectorAll('input[name="asEmailAudience"]').forEach(r => r.onchange = () => { actualiserDestinataires(); appliquerModele(); });
  overlay.querySelector("#asEmailTemplate").onchange = appliquerModele;
  overlay.querySelector("#asEmailDate").onchange = appliquerModele;
  actualiserDestinataires(); appliquerModele();

  overlay.querySelector("#asEmailSend").onclick = async () => {
    const bouton = overlay.querySelector("#asEmailSend");
    const resultat = overlay.querySelector("#asEmailResult");
    const subject = overlay.querySelector("#asEmailSubject").value.trim();
    const message = overlay.querySelector("#asEmailMessage").value.trim();
    const c = compteur(audience());
    if (!c.nombre) { resultat.textContent = "Aucune adresse utilisable pour ce choix."; return; }
    if (!subject || !message) { resultat.textContent = "L’objet et le message sont obligatoires."; return; }
    if (!confirm(`Envoyer ${c.nombre} e-mail(s) séparés et confidentiels ?`)) return;
    bouton.disabled = true; resultat.textContent = "Envoi en cours…";
    try {
      const attachment = await lirePieceJointeAS(overlay.querySelector("#asEmailAttachment").files[0]);
      const response = await apiFetch(`${SUPABASE_URL}/functions/v1/eps-as-slot-email`, { method: "POST", body: JSON.stringify({
        requestId: crypto.randomUUID(), slotId: slot.id, audience: audience(), subject, message,
        template: overlay.querySelector("#asEmailTemplate").value, selectedDate: overlay.querySelector("#asEmailDate").value || null,
        attachment
      }) });
      resultat.innerHTML = `<b>${response.sent || 0} e-mail(s) envoyé(s).</b>${response.failed ? `<span>${response.failed} échec(s).</span>` : ""}${response.missing?.length ? `<span>${response.missing.length} élève(s) sans adresse adaptée.</span>` : ""}`;
      if (!response.failed) bouton.textContent = "Envoyé";
    } catch (error) {
      resultat.textContent = error.message || "L’envoi a échoué.";
      bouton.disabled = false;
    }
  };
}

async function ouvrirFicheCreneau(slot) {
  if (!slot) return;
  const panel = document.getElementById("unssPanel"); ouvrirFenetreUnss();
  const appelAutorise = peutFaireAppelCreneau(slot);
  panel.classList.add("as-full-panel"); panel.innerHTML = `<div class="as-detail-hero"><button class="as-back" id="asClose">←</button><div><small>CRÉNEAU AS</small><h2>${unssText(slot.activity_name)}</h2></div><span>${iconeActiviteAS(slot.activity_name)}</span></div><div class="as-detail-body"><section class="as-main-card"><div class="as-main-title"><i>${iconeActiviteAS(slot.activity_name)}</i><div><h2>${unssText(slot.activity_name)}</h2><p>⌖ ${unssText(slot.location || "Lieu non renseigné")}</p><p>👤 ${unssText(slot.responsible_teacher || "Professeur non attribué")}</p><p>♟ ${elevesDuCreneau(slot.id).length} inscrits</p><p>▣ ${unssText(capitaliseJour(slot.day_of_week))} · ${unssText(slot.start_time || "")}–${unssText(slot.end_time || "")}</p></div></div><div class="as-metrics"><span id="asMetricInscrits" style="cursor:pointer"><b>${elevesDuCreneau(slot.id).length}</b> inscrits</span><span><b>${seancesDuCreneau(slot.id).length}</b> appels</span></div></section><div class="as-action-grid"><button id="asStudents">♟＋<b>Élèves</b></button>${appelAutorise ? `<button id="asCall">☑<b>Appel</b></button>` : ""}<button id="asBalance">▥<b>Bilan</b></button><button id="asExport">⇩<b>Télécharger</b></button><button id="asEmail">✉<b>E-mail</b></button></div>${appelAutorise ? "" : `<div class="muted">L’appel est réservé à ${unssText(slot.responsible_teacher || "la personne affectée à ce créneau")}.</div>`}<section class="as-about"><h3>▤ À propos</h3><p>${unssText(slot.notes || "Créneau ouvert aux élèves inscrits. Pensez à vérifier le matériel et les dispenses avant l’appel.")}</p></section><button class="secondary" id="asEdit">Modifier le créneau</button><button class="danger" id="asDelete">Supprimer ce créneau</button></div>`;
  asClose.onclick=()=>fermerFenetreUnss(); asStudents.onclick=()=>ouvrirElevesCreneau(slot); asBalance.onclick=()=>ouvrirBilanCreneau(slot); asExport.onclick=()=>showCreneauExport(slot,elevesDuCreneau(slot.id)); asEmail.onclick=()=>ouvrirEmailCreneau(slot); const boutonAppel=document.getElementById("asCall"); if (boutonAppel) boutonAppel.onclick=()=>ouvrirAppelCreneau(slot);asEdit.onclick=()=>openUnssSlotPanel(slot);asDelete.onclick=()=>supprimerCreneau(slot.id);
  document.getElementById("asMetricInscrits").onclick=()=>ouvrirListeInscritsCreneau(slot);
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

async function openUnssSlotPanel(slot) {
  const panel = document.getElementById("unssPanel");
  const isNew = !slot;
  const contexte = await loadTeamContext().catch(() => null);
  const professeurs = contexte?.members || [];
  const responsableActuel = slot?.responsible_teacher || "";
  const responsableIdActuel = slot?.assigned_teacher_id ||
    professeurs.find(p => (p.name || p.email) === responsableActuel)?.id || "";
  // Une ancienne valeur saisie librement doit rester sélectionnable même si le compte associé
  // n'est plus dans l'établissement : la modifier ne doit pas l'effacer silencieusement.
  const nomsProfesseurs = [...new Set(professeurs.map(p => p.name || p.email).filter(Boolean))];
  if (responsableActuel && !nomsProfesseurs.includes(responsableActuel)) nomsProfesseurs.unshift(responsableActuel);
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
    <input type="time" id="unssSlotStart" value="${normaliserHeureCreneau(slot?.start_time)}">
    <label for="unssSlotEnd">Heure de fin</label>
    <input type="time" id="unssSlotEnd" value="${normaliserHeureCreneau(slot?.end_time)}">
    <label for="unssSlotLocation">Lieu</label>
    <input type="text" id="unssSlotLocation" value="${slot ? unssText(slot.location) : ""}" placeholder="Gymnase, stade...">
    <label for="unssSlotPlaces">Places (facultatif)</label>
    <input type="number" id="unssSlotPlaces" min="1" value="${slot && slot.max_places ? slot.max_places : ""}">
    <label for="unssSlotTeacher">Professeur responsable</label>
    <select id="unssSlotTeacher">
      <option value="">Non attribué</option>
      ${professeurs.map(prof => {
        const nom = prof.name || prof.email;
        return `<option value="${unssText(prof.id)}"${prof.id === responsableIdActuel ? " selected" : ""}>${unssText(nom)}</option>`;
      }).join("")}
    </select>
    ${nomsProfesseurs.length === 0 ? `<div class="muted">Aucun autre compte professeur n’est disponible dans cet établissement.</div>` : ""}
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
    const professeurChoisi = document.getElementById("unssSlotTeacher");
    const body = {
      activity_name: activite,
      day_of_week: document.getElementById("unssSlotDay").value,
      start_time: normaliserHeureCreneau(document.getElementById("unssSlotStart").value),
      end_time: normaliserHeureCreneau(document.getElementById("unssSlotEnd").value),
      location: document.getElementById("unssSlotLocation").value.trim(),
      max_places: Number.isFinite(places) && places > 0 ? places : null,
      responsible_teacher: professeurChoisi.selectedOptions[0]?.textContent === "Non attribué"
        ? "" : professeurChoisi.selectedOptions[0]?.textContent || "",
      comment: document.getElementById("unssSlotComment").value.trim(),
      updated_at: new Date().toISOString()
    };
    if (affectationCreneauxActive) body.assigned_teacher_id = professeurChoisi.value || null;
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
function openUnssStudentPanel(student, licensing, directoryEditing = false) {
  const panel = document.getElementById("unssPanel");
  const isNew = !student;
  const category = student ? student.category : "MINIME";
  panel.innerHTML = `
    <div class="student-editor-hero"><span aria-hidden="true">👤</span><div>
      <small>RÉPERTOIRE DES ÉLÈVES</small>
      <h2>${licensing ? "Licencier " + planningText(student.first_name || "") : (isNew ? "Nouvel élève" : "Modifier l’élève")}</h2>
      <p>${isNew ? "Complétez l’identité et les coordonnées." : "Les changements seront synchronisés avec l’application."}</p>
    </div></div>
    <div class="student-editor-section"><h3>Identité</h3>
    <div class="student-editor-grid">
    <label for="unssLastName">Nom</label>
    <input type="text" id="unssLastName" value="${student ? planningText(student.last_name) : ""}">
    <label for="unssFirstName">Prenom</label>
    <input type="text" id="unssFirstName" value="${student ? planningText(student.first_name) : ""}">
    <label for="unssDivision">Division (classe d'origine)</label>
    <input type="text" id="unssDivision" placeholder="ex : 2.1, 6e3" value="${student ? planningText(student.division || "") : ""}">
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
    </div></div>
    ${licensing || (student && student.licensed) ? `
      <div class="student-editor-section"><h3>Association sportive</h3>
      <div class="student-editor-grid">
      ${[1, 2, 3].map(n => `
        <label for="unssWish${n}">Voeu ${n}</label>
        ${menuCreneaux(`unssWish${n}`, student ? student[`wish${n}_slot_id`] : null, student ? student[`wish${n}`] : "")}
      `).join("")}
      <label for="unssJersey">Taille maillot</label>
      <input type="text" id="unssJersey" value="${student ? planningText(student.jersey_size || "") : ""}">
      </div></div>
      <div class="student-editor-section"><h3>Hébergement</h3>
      <div class="student-editor-grid">
      <label for="unssHostAvailable">Peut héberger un(e) camarade</label>
      <select id="unssHostAvailable">
        <option value="non"${!student || !student.host_available ? " selected" : ""}>Non</option>
        <option value="oui"${student && student.host_available ? " selected" : ""}>Oui</option>
      </select>
      </div>
      <div class="student-editor-grid" id="unssHostDetails" style="${student && student.host_available ? "" : "display:none"}">
      <label for="unssHostCapacity">Nombre de places</label>
      <input type="number" id="unssHostCapacity" min="1" value="${student && student.host_capacity ? student.host_capacity : ""}">
      <label for="unssHostAgeMin">Âge souhaité (si possible)</label>
      <div style="display:flex; gap:8px">
        <input type="number" id="unssHostAgeMin" min="0" max="25" placeholder="de" value="${student && student.host_age_min ? student.host_age_min : ""}" style="width:80px">
        <input type="number" id="unssHostAgeMax" min="0" max="25" placeholder="à" value="${student && student.host_age_max ? student.host_age_max : ""}" style="width:80px">
      </div>
      <label for="unssHostSexPref">Sexe souhaité</label>
      <select id="unssHostSexPref">
        <option value=""${!student || !student.host_sex_pref ? " selected" : ""}>Indifférent</option>
        <option value="F"${student && student.host_sex_pref === "F" ? " selected" : ""}>Fille</option>
        <option value="M"${student && student.host_sex_pref === "M" ? " selected" : ""}>Garçon</option>
      </select>
      </div></div>
      <div class="student-editor-section"><h3>Dossier administratif</h3>
      <div class="student-editor-grid">
      <label for="unssMissingPayment">Il manque le paiement</label>
      <input type="checkbox" id="unssMissingPayment" style="width:auto; justify-self:start"${student && student.payment_missing ? " checked" : ""}>
      <label for="unssMissingCertificate">Il manque le certificat médical</label>
      <input type="checkbox" id="unssMissingCertificate" style="width:auto; justify-self:start"${student && student.medical_certificate_missing ? " checked" : ""}>
      </div></div>
    ` : ""}
    ${directoryEditing || licensing || (student && student.licensed) ? `
      <div class="student-editor-section"><h3>Coordonnées</h3>
      <div class="student-editor-grid">
      <label for="unssEmailEleve">Email eleve</label>
      <input type="email" id="unssEmailEleve" value="${student ? planningText(student.student_email || "") : ""}">
      <label for="unssEmailParent">Email parent</label>
      <input type="email" id="unssEmailParent" value="${student ? planningText(student.parent_email || "") : ""}">
      </div></div>
    ` : ""}
    <div class="student-editor-actions"><button id="unssSaveBtn">✓ Enregistrer</button>
    ${!isNew && student.licensed ? `<button class="secondary" id="unssUnlicenseBtn">Retirer la licence AS</button>` : ""}
    <button class="secondary" id="unssCancelBtn">Annuler</button></div>
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
  document.getElementById("unssHostAvailable")?.addEventListener("change", () => {
    const details = document.getElementById("unssHostDetails");
    if (details) details.style.display = document.getElementById("unssHostAvailable").value === "oui" ? "" : "none";
  });
  document.getElementById("unssCancelBtn").addEventListener("click", () => fermerFenetreUnss());
  // Retirer la licence sans effacer la fiche : l'eleve redevient un simple eleve du repertoire,
  // ses voeux et sa taille de maillot n'ont plus de raison d'etre gardes. A distinguer de
  // "Supprimer", qui efface toute la fiche (identite comprise) et n'a rien a voir avec cette
  // demande frequente : ne plus le voir dans les licencies AS sans perdre son dossier eleve.
  document.getElementById("unssUnlicenseBtn")?.addEventListener("click", async () => {
    if (!confirm(`Retirer la licence AS de ${student.first_name} ${student.last_name} ? L'eleve reste dans le repertoire, mais disparait des licencies AS.`)) return;
    try {
      await enregistrerLigne("unss_students", {
        ...student, licensed: false,
        wish1_slot_id: null, wish1: "", wish2_slot_id: null, wish2: "", wish3_slot_id: null, wish3: "",
        jersey_size: "", host_available: false, host_capacity: null, host_age_min: null, host_age_max: null,
        host_sex_pref: null, payment_missing: false, medical_certificate_missing: false,
        updated_at: new Date().toISOString()
      });
    } catch (erreur) {
      document.getElementById("unssError").textContent = erreur.message || "Licence non retiree. Verifiez la connexion.";
      return;
    }
    fermerFenetreUnss();
    await loadUnssStudents();
    renderUnssTab();
  });
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
    const emailEleveField = document.getElementById("unssEmailEleve");
    const emailParentField = document.getElementById("unssEmailParent");
    if (emailEleveField) body.student_email = emailEleveField.value.trim() || null;
    if (emailParentField) body.parent_email = emailParentField.value.trim() || null;
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
      const hebergeOui = document.getElementById("unssHostAvailable").value === "oui";
      body.host_available = hebergeOui;
      body.host_capacity = hebergeOui ? (+document.getElementById("unssHostCapacity").value || null) : null;
      body.host_age_min = hebergeOui ? (+document.getElementById("unssHostAgeMin").value || null) : null;
      body.host_age_max = hebergeOui ? (+document.getElementById("unssHostAgeMax").value || null) : null;
      body.host_sex_pref = hebergeOui ? (document.getElementById("unssHostSexPref").value || null) : null;
      body.payment_missing = document.getElementById("unssMissingPayment").checked;
      body.medical_certificate_missing = document.getElementById("unssMissingCertificate").checked;
    }
    // Ligne entiere : la file d'attente ne porte pas de retouches, et un envoi differe qui
    // n'emporterait que les champs saisis effacerait les autres.
    const studentId = isNew ? crypto.randomUUID() : student.id;
    try {
      if (isNew) {
        await enregistrerLigne("unss_students",
          { id: studentId, user_id: session.user_id, licensed: false, deleted: false, ...body });
      } else {
        // L'identifiant reste identique : une correction de division ne duplique pas l'eleve
        // et conserve ses licences, ses voeux et ses inscriptions AS.
        await enregistrerLigne("unss_students", { ...student, ...body });
      }
      // Le voeu 1 est le choix prioritaire de l'eleve : l'inscrire tout de suite au creneau
      // correspondant evite un aller-retour ("Ajouter des eleves" > le retrouver > confirmer)
      // pour ce qui est deja decide. Les voeux 2 et 3 restent proposes (precoches) depuis le
      // creneau, au cas ou la place manque sur le premier choix.
      if (body.wish1_slot_id) await inscrireAutomatiquementVoeu1(studentId, body.wish1_slot_id);
    } catch (erreur) {
      document.getElementById("unssError").textContent =
        erreur.message || "Élève non enregistré. Vérifiez la connexion.";
      return;
    }
    fermerFenetreUnss();
    await loadUnssStudents();
    renderUnssTab();
  });
}

/**
 * Inscrit l'eleve a son creneau de voeu 1, sans doublon si une inscription existe deja (voeu
 * modifie deux fois, ou saisi hors ligne puis rejoue). Silencieuse en cas d'echec reseau : la
 * fiche eleve est deja enregistree, l'inscription se rattrapera au prochain "Ajouter des eleves"
 * plutot que de faire echouer toute la licence pour cette seule etape.
 */
async function inscrireAutomatiquementVoeu1(studentId, slotId) {
  try {
    // unss_memberships est une table suivie (hors-connexion.js) : le filtre s'applique en JS via
    // "ou", pas dans la requete - le chemin direct ci-dessous ne sert qu'au repli non suivi.
    const existantes = await lireTable("unss_memberships",
      `unss_memberships?slot_id=eq.${encodeURIComponent(slotId)}&student_id=eq.${encodeURIComponent(studentId)}&deleted=eq.false&select=id`,
      { ou: r => r.slot_id === slotId && r.student_id === studentId });
    if (existantes.length) return false;
    const ligne = {
      id: crypto.randomUUID(), user_id: session.user_id, slot_id: slotId,
      student_id: studentId, updated_at: new Date().toISOString(), deleted: false
    };
    await enregistrerLigne("unss_memberships", ligne);
    // unss_memberships n'est relue qu'une fois par session (chargement paresseux, voir
    // loadUnssInscriptions) : sans ce push, l'eleve resterait absent de l'ecran "Eleves inscrits"
    // tant que l'onglet Creneaux AS n'est pas rouvert depuis zero.
    unssInscriptions.push(ligne);
    return true;
  } catch { return false; /* la fiche eleve reste enregistree ; l'inscription se fera manuellement si besoin */ }
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
  // Le même formulaire s'ouvre depuis ASLVH et depuis l'onglet principal Élèves. S'il reste
  // enfant de l'onglet ASLVH, `display:none` sur cet onglet masque aussi la fenêtre pourtant
  // ouverte. La fenêtre appartient donc au document, indépendamment de l'onglet de départ.
  document.body.appendChild(voile);
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
function fermerFenetreUnss() {
  document.getElementById("unssPanelOverlay")?.classList.remove("open");
  document.getElementById("unssPanel")?.classList.remove("as-full-panel", "as-list-modal");
}

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

// ---- UNSS > le creneau porte ses eleves, ses seances et son bilan ----------------------------
//
// Il y avait deux objets qui disaient presque la meme chose : le creneau, qui ne servait qu'aux
// voeux, et le groupe, qui portait les eleves et les appels. Creer une activite demandait de la
// saisir deux fois. Le creneau porte desormais tout.
//
// La bascule attend schema_as_creneaux.sql : sans lui, la colonne slot_id n'existe pas et
// l'ancien onglet Groupe reste en place plutot que de laisser un ecran qui refuse d'enregistrer.

/** Inscriptions et seances de tous les creneaux, relues avec l'onglet. */
let unssInscriptions = [];
let unssSeances = [];
let unssPresences = [];
/** Creneau ouvert dans l'ecran Appel. */
let unssAppelSlotId = null;
let unssAppelVue = "historique";
/** Vrai une fois schema_as_creneaux.sql applique. Demande une seule fois. */
let creneauPorteTout = false;
let creneauPromesse = null;

async function verifierCreneauPorteTout() {
  if (!creneauPromesse) {
    creneauPromesse = (async () => {
      try {
        const res = await apiFetch(`${SUPABASE_URL}/rest/v1/eps_schema_marks?name=eq.as_creneaux&select=name`);
        return res.ok && (await res.json()).length > 0;
      } catch { return false; }
    })();
  }
  creneauPorteTout = await creneauPromesse;
  return creneauPorteTout;
}

async function loadUnssInscriptions() {
  if (!creneauPorteTout) { unssInscriptions = []; unssSeances = []; unssPresences = []; return; }
  [unssInscriptions, unssSeances] = await Promise.all([
    lireTable("unss_memberships", "unss_memberships?deleted=eq.false&select=*"),
    lireTable("unss_sessions", "unss_sessions?deleted=eq.false&select=*")
  ]);
  const idsSeances = unssSeances.map(s => s.id);
  unssPresences = idsSeances.length
    ? await lireTable("unss_attendance",
        `unss_attendance?deleted=eq.false&session_id=in.(${idsSeances.join(",")})&select=*`,
        { ou: a => idsSeances.includes(a.session_id) })
    : [];
}

/** Eleves inscrits a un creneau, dans l'ordre alphabetique. */
function elevesDuCreneau(slotId) {
  const ids = unssInscriptions.filter(i => i.slot_id === slotId).map(i => i.student_id);
  return unssStudents.filter(e => ids.includes(e.id))
    .sort((a, b) => String(a.last_name || "").localeCompare(String(b.last_name || ""), "fr")
      || String(a.first_name || "").localeCompare(String(b.first_name || ""), "fr"));
}

/** Seances d'un creneau, de la plus recente a la plus ancienne. */
function seancesDuCreneau(slotId) {
  return unssSeances.filter(s => s.slot_id === slotId)
    .sort((a, b) => Number(b.date_epoch_millis || 0) - Number(a.date_epoch_millis || 0));
}

const dateSeance = ms => new Date(Number(ms || 0)).toLocaleDateString("fr-FR",
  { weekday: "long", day: "numeric", month: "long" });
// En-tete de colonne du bilan : couper la date longue ne gardait que le jour, et deux
// seances d'un meme creneau s'affichaient toutes deux « lundi ».
const dateSeanceCourte = ms => new Date(Number(ms || 0)).toLocaleDateString("fr-FR",
  { day: "2-digit", month: "2-digit" });

/** Rien a afficher tant que les inscriptions ne sont pas revenues : on les attend. */
async function assurerInscriptions() {
  await verifierCreneauPorteTout();
  if (creneauPorteTout && unssInscriptions.length === 0 && unssSeances.length === 0) {
    await loadUnssInscriptions();
  }
}

/** Les eleves d'un creneau : ajouter, retirer. */
/** Une section vœu 2 ou vœu 3 : chaque candidat avec son propre bouton Ajouter, pas une case a
 * cocher - on veut pouvoir en ajouter un sans manipuler les autres. */
function sectionVoeuHtml(rang, eleves) {
  if (eleves.length === 0) return "";
  return `<div class="muted" style="font-weight:600;margin:12px 0 4px">Ont classé cette activité en vœu ${rang} (${eleves.length})</div>
    ${eleves.map(e => `<div class="unssCard" style="padding:6px 0">
         <div>${unssText(String(e.last_name || "").toUpperCase())} ${unssText(e.first_name || "")}</div>
         <button data-ajouter-voeu="${e.id}" style="margin-top:0">Ajouter</button>
       </div>`).join("")}`;
}

/**
 * "Inscrits" (le chiffre sur la fiche du créneau) : juste la liste, en lecture seule - nom,
 * prénom, classe, catégorie. Ajouter ou retirer un élève reste réservé au bouton "+ Élèves"
 * (ouvrirElevesCreneau), pour ne pas mélanger consultation rapide et modification.
 */
async function ouvrirListeInscritsCreneau(slot) {
  const panel = document.getElementById("unssPanel");
  ouvrirFenetreUnss();
  panel.innerHTML = `<div class="muted">Chargement…</div>`;
  await assurerInscriptions();
  const eleves = elevesDuCreneau(slot.id);
  panel.classList.add("as-full-panel");
  panel.innerHTML = `<div class="as-panel-title"><button class="as-back" id="unssListeInscritsCloseBtn">←</button><div><h2>Élèves inscrits</h2><small>${unssText(slot.activity_name)} · ${unssText(unssSlotLabel(slot))}</small></div><button class="as-panel-export" id="unssListeInscritsExportBtn">⇩ Télécharger</button></div>
    ${eleves.length === 0
      ? `<div class="muted" style="margin-top:10px">Aucun élève inscrit.</div>`
      : `<div style="overflow-x:auto; margin-top:10px"><table class="eleveTable"><thead><tr><th>Nom</th><th>Prénom</th><th>Classe</th><th>Catégorie</th></tr></thead><tbody>${
          eleves.map(e => `<tr><td>${unssText(String(e.last_name || "").toUpperCase())}</td><td>${unssText(e.first_name || "")}</td><td>${unssText(e.division || "")}</td><td>${unssText(unssCategoryLabel(e.category, e.sex))}</td></tr>`).join("")
        }</tbody></table></div>`
    }`;
  document.getElementById("unssListeInscritsCloseBtn").addEventListener("click", () => ouvrirFicheCreneau(slot));
  document.getElementById("unssListeInscritsExportBtn").addEventListener("click", () => showCreneauExport(slot, eleves));
}

async function ouvrirElevesCreneau(slot) {
  const panel = document.getElementById("unssPanel");
  ouvrirFenetreUnss();
  panel.innerHTML = `<div class="muted">Chargement…</div>`;
  await assurerInscriptions();
  const eleves = elevesDuCreneau(slot.id);
  const dejaLa = eleves.map(e => e.id);
  const voeu2 = unssStudents.filter(s => s.licensed && s.wish2_slot_id === slot.id && !dejaLa.includes(s.id));
  const voeu3 = unssStudents.filter(s => s.licensed && s.wish3_slot_id === slot.id && !dejaLa.includes(s.id));
  panel.classList.add("as-full-panel");
  panel.innerHTML = `<div class="as-panel-title"><button class="as-back" id="unssCreneauCloseBtn">←</button><div><h2>Élèves inscrits</h2><small>${unssText(slot.activity_name)} · ${unssText(unssSlotLabel(slot))}</small></div><button class="as-panel-export" id="unssCreneauExportBtn">⇩ Télécharger</button></div>
    <div class="muted">${unssText(unssSlotLabel(slot))}</div>
    <div id="unssCreneauEleves" style="margin-top:10px">${
      eleves.length === 0
        ? `<div class="muted">Aucun élève inscrit. Ajoutez-en un.</div>`
        : eleves.map(e => `<div class="unssCard" style="padding:6px 0">
             <div>${unssText(String(e.last_name || "").toUpperCase())} ${unssText(e.first_name || "")}</div>
             <button class="danger" data-retirer="${e.id}" style="margin-top:0">Retirer</button>
           </div>`).join("")
    }</div>
    <div id="unssCreneauVoeux">${sectionVoeuHtml(2, voeu2)}${sectionVoeuHtml(3, voeu3)}</div>
    <button class="secondary" id="unssCreneauAddBtn" style="margin-top:12px">Chercher un autre élève</button>
    `;
  panel.querySelectorAll("[data-retirer]").forEach(btn => btn.addEventListener("click", async () => {
    const inscription = unssInscriptions.find(i => i.slot_id === slot.id && i.student_id === btn.dataset.retirer);
    if (inscription) {
      try { await supprimerLigne("unss_memberships", inscription.id); }
      catch (erreur) { alert(erreur.message); return; }
      unssInscriptions = unssInscriptions.filter(i => i.id !== inscription.id);
    }
    ouvrirElevesCreneau(slot);
  }));
  panel.querySelectorAll("[data-ajouter-voeu]").forEach(btn => btn.addEventListener("click", async () => {
    btn.disabled = true;
    const ligne = { id: crypto.randomUUID(), user_id: session.user_id, slot_id: slot.id,
      student_id: btn.dataset.ajouterVoeu, updated_at: new Date().toISOString(), deleted: false };
    try { await enregistrerLigne("unss_memberships", ligne); }
    catch (erreur) { btn.disabled = false; alert(erreur.message); return; }
    unssInscriptions.push(ligne);
    ouvrirElevesCreneau(slot);
  }));
  document.getElementById("unssCreneauAddBtn").addEventListener("click",
    () => ouvrirAjoutElevesCreneau(slot));
  document.getElementById("unssCreneauExportBtn").addEventListener("click", () => showCreneauExport(slot, eleves));
  document.getElementById("unssCreneauCloseBtn").addEventListener("click", () => ouvrirFicheCreneau(slot));
}


/**
 * Recherche libre dans tout le repertoire : le vœu 1 s'inscrit tout seul a la licence
 * (inscrireAutomatiquementVoeu1), et les vœux 2/3 s'ajoutent d'un bouton directement depuis
 * "Élèves inscrits" (sectionVoeuHtml) - ce panneau ne sert donc plus qu'a chercher un eleve qui
 * n'a pas classe cette activite dans ses vœux.
 */
function ouvrirAjoutElevesCreneau(slot) {
  const panel = document.getElementById("unssPanel");
  const dejaLa = elevesDuCreneau(slot.id).map(e => e.id);
  const candidats = unssStudents.filter(e => !dejaLa.includes(e.id));
  const licencies = candidats.filter(e => e.licensed);
  panel.innerHTML = `<h2>Chercher un élève · ${unssText(slot.activity_name)}</h2>` +
    (candidats.length === 0
      ? `<div class="muted">Tous les élèves du répertoire sont déjà inscrits à ce créneau.</div>`
      : `${licencies.length === 0
            ? `<div class="muted" style="margin-bottom:8px">Aucun licencié AS pour l'instant : licenciez un élève depuis
                 <strong>Licenciés AS</strong>, ou cherchez ci-dessous dans tout le répertoire.</div>`
            : `<label style="display:flex; align-items:center; gap:8px; margin-bottom:8px">
                 <input type="checkbox" id="creneauTous" style="width:auto">
                 <span>Chercher dans tout le répertoire (${candidats.length} élèves), pas seulement les ${licencies.length} licencié(s)</span>
               </label>`}
         <input type="search" id="creneauRecherche" placeholder="Rechercher un nom ou un prenom" autocomplete="off" style="width:100%">
         <div class="muted" id="creneauCompte" style="margin:6px 0"></div>
         <div id="creneauResultats"></div>`) +
    `<button class="secondary" id="creneauRetour" style="margin-top:14px">Retour</button>`;

  const inscrireEleves = async ids => {
    for (const id of ids) {
      const ligne = { id: crypto.randomUUID(), user_id: session.user_id, slot_id: slot.id,
        student_id: id, updated_at: new Date().toISOString(), deleted: false };
      try { await enregistrerLigne("unss_memberships", ligne); }
      catch (erreur) { alert(erreur.message); return false; }
      unssInscriptions.push(ligne);
    }
    return true;
  };

  const zone = document.getElementById("creneauResultats");
  if (zone) {
    const champ = document.getElementById("creneauRecherche");
    const compteur = document.getElementById("creneauCompte");
    const caseTous = document.getElementById("creneauTous");
    const LIMITE = 50;
    const afficher = () => {
      const recherche = champ.value.trim();
      const source = (caseTous && !caseTous.checked && licencies.length) ? licencies : candidats;
      const trouves = chercherEleves(source, recherche);
      if (!recherche && source.length > LIMITE) {
        compteur.textContent = `${source.length} eleves disponibles. Tapez un nom ou un prenom pour filtrer.`;
        zone.innerHTML = "";
        return;
      }
      const affiches = trouves.slice(0, LIMITE);
      compteur.textContent = trouves.length === 0 ? "Aucun eleve ne correspond."
        : `${trouves.length} eleve(s)${trouves.length > affiches.length ? ` — ${affiches.length} premiers affiches` : ""}`;
      zone.innerHTML = affiches.map(e =>
        `<div class="card unssPick" data-inscrire="${e.id}" style="margin-top:6px">${unssText(String(e.last_name || "").toUpperCase())} ${unssText(e.first_name || "")}</div>`).join("");
      zone.querySelectorAll("[data-inscrire]").forEach(el => el.addEventListener("click", async () => {
        if (await inscrireEleves([el.dataset.inscrire])) ouvrirElevesCreneau(slot);
      }));
    };
    champ.addEventListener("input", afficher);
    if (caseTous) caseTous.addEventListener("change", afficher);
    afficher();
    champ.focus();
  }
  document.getElementById("creneauRetour").addEventListener("click", () => ouvrirElevesCreneau(slot));
}

/**
 * Le bilan d'un creneau : qui est venu, combien de fois.
 *
 * C'est ce qu'on cherche en fin de trimestre, et il fallait jusqu'ici ouvrir la fiche de chaque
 * eleve l'une apres l'autre pour le reconstituer.
 */
async function ouvrirBilanCreneau(slot) {
  const panel = document.getElementById("unssPanel");
  ouvrirFenetreUnss();
  panel.innerHTML = `<div class="muted">Chargement…</div>`;
  await assurerInscriptions();
  const seances = seancesDuCreneau(slot.id);
  const idsSeances = seances.map(s => s.id);
  const eleves = elevesDuCreneau(slot.id);
  const lignes = eleves.map(e => {
    const siennes = unssPresences.filter(p => p.student_id === e.id && idsSeances.includes(p.session_id));
    const presents = siennes.filter(p => p.present).length;
    return { eleve: e, presents, absents: siennes.length - presents, notees: siennes.length };
  }).sort((a, b) => b.presents - a.presents
    || String(a.eleve.last_name || "").localeCompare(String(b.eleve.last_name || ""), "fr"));
  panel.classList.add("as-full-panel");
  const tauxGlobal = lignes.reduce((a,l)=>a+l.presents,0);
  const totalPointe = lignes.reduce((a,l)=>a+l.notees,0);
  panel.innerHTML = `<div class="as-panel-title"><button class="as-back" id="unssBilanClose">←</button><div><h2>Bilan de présence</h2><small>${unssText(slot.activity_name)} · ${unssText(unssSlotLabel(slot))}</small></div></div>
    <div class="as-bilan-metrics"><article><b>${seances.length}</b><span>appels</span></article><article><b>${eleves.length}</b><span>élèves</span></article><article><b>${totalPointe?Math.round(tauxGlobal*100/totalPointe):0} %</b><span>présence</span></article></div>
    ${eleves.length === 0
      ? `<div class="muted" style="margin-top:10px">Aucun élève inscrit à ce créneau.</div>`
      : `<div class="as-bilan-table"><table class="eleveTable"><thead><tr>
           <th>Élève</th>${seances.map(s=>`<th>${dateSeanceCourte(s.date_epoch_millis)}</th>`).join('')}<th>%</th></tr></thead><tbody>${
           lignes.map(l => `<tr><td>${unssText(String(l.eleve.last_name || "").toUpperCase())} ${unssText(l.eleve.first_name || "")}</td>${seances.map(s=>{const p=unssPresences.find(x=>x.student_id===l.eleve.id&&x.session_id===s.id);return `<td><i class="as-presence-dot ${!p?'none':p.present?'yes':'no'}">${!p?'–':p.present?'P':'A'}</i></td>`}).join('')}<td><b>${l.notees?Math.round(l.presents*100/l.notees):0}%</b></td></tr>`).join("")
         }</tbody></table></div>`}
    `;
  document.getElementById("unssBilanClose").addEventListener("click", () => fermerFenetreUnss());
}

/** Appel plein écran depuis la fiche du créneau, comme dans l'application mobile. */
async function ouvrirAppelCreneau(slot, seance = null) {
  if (!peutFaireAppelCreneau(slot)) {
    alert(`L’appel de ce créneau est réservé à ${slot.responsible_teacher || "son professeur responsable"}.`);
    return;
  }
  const panel=document.getElementById('unssPanel'); ouvrirFenetreUnss();
  panel.classList.add('as-full-panel'); panel.innerHTML=`<div class="as-panel-title"><button class="as-back" id="asCallBack">←</button><div><h2>Appel</h2><small>${unssText(slot.activity_name)} · ${new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}</small></div><b>☑</b></div><div class="as-call-wrap"><div id="unssAppelBody"></div></div>`;
  unssAppelSlotId=slot.id;unssAppelMembers=membresPourSeance(slot.id,seance);unssAppelPresence={};
  unssAppelMembers.forEach(e=>{const p=seance&&unssPresences.find(x=>x.session_id===seance.id&&x.student_id===e.id);unssAppelPresence[e.id]=p?!!p.present:true});
  await chargerDispensesAppel();renderUnssAppelBody(slot,seance);asCallBack.onclick=()=>ouvrirFicheCreneau(slot);
}

// ---- UNSS > Appel : choisir un groupe, cocher present/absent, enregistrer une seance ----

function renderUnssAppelTab() {
  const wrap = document.getElementById("unssList");
  // Tant que le creneau ne porte pas tout, l'appel reste sur les groupes : on ne change pas
  // l'ecran sous les pieds d'une base qui n'a pas encore la colonne slot_id.
  if (!creneauPorteTout) { renderUnssAppelGroupes(); return; }

  // Même l'administrateur ne fait l'appel que de ses propres créneaux : son rôle lui permet
  // d'organiser et d'affecter, pas d'encombrer son écran avec les activités des collègues.
  const creneaux = unssSlots.filter(s => !s.deleted && peutFaireAppelCreneau(s));
  if (creneaux.length === 0) {
    wrap.innerHTML = `<div class="muted">Aucun créneau AS ne vous est affecté. Un administrateur peut vous
      attribuer un créneau depuis <strong>Créneaux AS → Modifier le créneau</strong>.</div>`;
    return;
  }
  if (!creneaux.some(s => s.id === unssAppelSlotId)) unssAppelSlotId = creneaux[0].id;
  const creneau = creneaux.find(s => s.id === unssAppelSlotId);
  const seances = seancesDuCreneau(unssAppelSlotId);
  const inscrits = elevesDuCreneau(unssAppelSlotId);
  const idsSeances = new Set(seances.map(s => String(s.id)));
  const bilanEleves = inscrits.map(e => {
    const lignes = unssPresences.filter(p => String(p.student_id) === String(e.id) && idsSeances.has(String(p.session_id)));
    const presents = lignes.filter(p => p.present).length;
    return { eleve: e, presents, absents: lignes.length - presents, total: lignes.length,
      taux: lignes.length ? Math.round(presents * 100 / lignes.length) : 0 };
  }).sort((a,b) => String(a.eleve.last_name || "").localeCompare(String(b.eleve.last_name || ""), "fr"));
  const totalPointages = bilanEleves.reduce((total, ligne) => total + ligne.total, 0);
  const totalPresents = bilanEleves.reduce((total, ligne) => total + ligne.presents, 0);
  const tauxGlobal = totalPointages ? Math.round(totalPresents * 100 / totalPointages) : 0;
  const prochaine = prochaineSeanceCreneau(creneau);
  const professeur = creneau.responsible_teacher || creneau.teacher_name || creneau.assigned_teacher_name || "Non renseigné";
  const horaire = [normaliserHeureCreneau(creneau.start_time), normaliserHeureCreneau(creneau.end_time)].filter(Boolean).join(" – ");
  const contenuHistorique = `<section class="as-call-panel">
      <div class="as-call-panel-head"><div><span class="as-call-eyebrow">HISTORIQUE</span><h2>Appels enregistrés</h2></div>
        <button id="unssNouvelAppel" class="as-call-primary" ${inscrits.length ? "" : "disabled"}><span>＋</span> Faire l’appel</button></div>
      ${inscrits.length === 0
        ? `<div class="as-call-empty">Aucun élève inscrit à ce créneau.
             Ajoutez-en depuis <strong>Créneaux AS</strong>.</div>`
        : seances.length === 0
          ? `<div class="as-call-empty">Aucun appel enregistré. Cliquez sur « Faire l’appel » pour commencer.</div>`
          : `<div class="as-history-table"><div class="as-history-row as-history-head"><span>Date</span><span>Créneau</span><span>Présents</span><span>Absents</span><span>Actions</span></div>${
              seances.map(s => {
                const pointees = unssPresences.filter(p => String(p.session_id) === String(s.id));
                const presents = pointees.filter(p => p.present).length;
                const absents = pointees.length - presents;
                return `<div class="as-history-row"><span class="as-history-date"><b>${dateSeance(s.date_epoch_millis)}</b><small>${new Date(Number(s.date_epoch_millis)).getFullYear()}</small></span><span class="as-history-slot"><b>${unssText(horaire || "Horaire non renseigné")}</b><small>${unssText(creneau.location || "Lieu non renseigné")}</small></span><span><b class="as-call-count yes">${presents}</b></span><span><b class="as-call-count no">${absents}</b></span><span class="as-history-actions"><button class="secondary" data-seance="${s.id}">Ouvrir</button><button class="as-delete-icon" data-supprimer-seance="${s.id}" title="Supprimer cet appel" aria-label="Supprimer cet appel">×</button></span></div>`;
              }).join("")}</div>`}
    </section><div id="unssAppelBody" class="as-call-editor"></div>`;
  const contenuBilan = `<section class="as-attendance-summary as-call-panel">
      <div class="as-attendance-heading"><div><span class="as-call-eyebrow">ASSIDUITÉ</span><h2>Taux de présence</h2><p>${unssText(creneau.activity_name)} uniquement · ${seances.length} appel(s)</p></div><b>${inscrits.length}</b></div>
      ${bilanEleves.length ? `<div class="as-attendance-list">${bilanEleves.map(l => `<article><div><strong>${unssText(String(l.eleve.last_name || "").toUpperCase())} ${unssText(l.eleve.first_name || "")}</strong><small>${unssText(l.eleve.school_class_label || l.eleve.class_label || "")}</small></div><span>${l.presents} présent${l.presents>1?"s":""} · ${l.absents} absent${l.absents>1?"s":""}</span><b class="${l.taux < 60 ? "low" : l.taux < 80 ? "mid" : "good"}">${l.taux} %</b></article>`).join("")}</div>` : `<div class="muted">Aucun élève inscrit à ce créneau.</div>`}
    </section>`;

  wrap.innerHTML = `<div class="as-call-page">
    <nav class="as-call-breadcrumb" aria-label="Fil d’Ariane"><span>ASLVH</span><i>›</i><b>Appels</b></nav>
    <section class="as-slot-compact"><div class="as-slot-summary"><h1>${unssText(creneau.activity_name)} · ${unssText(capitaliseJour(creneau.day_of_week))}</h1><p><span>◷ ${unssText(horaire || "Horaire non renseigné")}</span><span>⌖ ${unssText(creneau.location || "Lieu non renseigné")}</span><span>♙ ${unssText(professeur)}</span></p></div><label class="as-slot-picker"><span>Changer de créneau</span><select id="unssAppelSlotSelect">${creneaux.map(s =>
      `<option value="${s.id}"${s.id === unssAppelSlotId ? " selected" : ""}>${unssText(unssSlotLabel(s))}</option>`).join("")}</select></label></section>
    <section class="as-call-kpis"><article><i>♙</i><div><b>${inscrits.length}</b><span>Élèves inscrits</span></div></article><article><i>▣</i><div><b>${seances.length}</b><span>Appels enregistrés</span></div></article><article><i class="as-rate-ring" style="--rate:${tauxGlobal * 3.6}deg"><em>${tauxGlobal}%</em></i><div><b>${tauxGlobal}%</b><span>Présence moyenne</span></div></article></section>
    <div class="as-call-layout"><main class="as-call-main"><div class="as-call-tabs"><button data-appel-vue="historique" class="${unssAppelVue === "historique" ? "active" : ""}">Appels enregistrés</button><button data-appel-vue="bilan" class="${unssAppelVue === "bilan" ? "active" : ""}">Taux de présence</button></div>${unssAppelVue === "bilan" ? contenuBilan : contenuHistorique}</main>
      <aside class="as-next-card"><span class="as-call-eyebrow">PROCHAINE SÉANCE</span>${prochaine ? `<div class="as-next-date"><b>${unssText(prochaine.jour)}</b><span>${prochaine.annee}</span></div>` : `<div class="as-next-date"><b>Date à définir</b></div>`}<dl><div><dt>◷ Horaire</dt><dd>${unssText(horaire || "Non renseigné")}</dd></div><div><dt>⌖ Lieu</dt><dd>${unssText(creneau.location || "Non renseigné")}</dd></div><div><dt>♙ Enseignant</dt><dd>${unssText(professeur)}</dd></div></dl><p class="as-next-note"><b>✓ Pense-bête</b><span>L’appel pourra être créé dès le début de la séance.</span></p></aside>
    </div></div>`;

  document.getElementById("unssAppelSlotSelect").addEventListener("change", (e) => {
    unssAppelSlotId = e.target.value;
    unssAppelVue = "historique";
    unssAppelPresence = {};
    renderUnssAppelTab();
  });
  wrap.querySelectorAll("[data-appel-vue]").forEach(b => b.addEventListener("click", () => { unssAppelVue = b.dataset.appelVue; renderUnssAppelTab(); }));
  document.getElementById("unssNouvelAppel")?.addEventListener("click", () => {
    unssAppelMembers = elevesDuCreneau(unssAppelSlotId);
    unssAppelPresence = {};
    unssAppelMembers.forEach(e => { unssAppelPresence[e.id] = true; });
    chargerDispensesAppel().then(() => renderUnssAppelBody(creneau, null));
  });
  // Supprimer un appel pointe par erreur (mauvaise date, doublon).
  //
  // Seule la seance est effacee, pas ses presences une par une : une presence dont la seance
  // n'est plus la n'est de toute facon jamais lue (bilans et taux partent des seances non
  // supprimees). Les effacer aussi envoyait une suppression par eleve, refusee des que la ligne
  // n'etait pas encore arrivee au serveur - et remplissait "Saisies a trancher" de refus.
  wrap.querySelectorAll("[data-supprimer-seance]").forEach(btn => btn.addEventListener("click", async () => {
    const seance = seances.find(s => s.id === btn.dataset.supprimerSeance);
    if (!seance) return;
    if (!confirm(`Supprimer l'appel du ${dateSeance(seance.date_epoch_millis)} ? Les présences pointées ce jour-là ne seront plus comptées.`)) return;
    btn.disabled = true;
    try {
      await supprimerLigne("unss_sessions", seance.id);
    } catch (erreur) {
      btn.disabled = false;
      alert(erreur.message || "Appel non supprimé. Vérifiez la connexion.");
      return;
    }
    unssPresences = unssPresences.filter(p => String(p.session_id) !== String(seance.id));
    unssSeances = unssSeances.filter(s => String(s.id) !== String(seance.id));
    renderUnssAppelTab();
  }));
  wrap.querySelectorAll("[data-seance]").forEach(btn => btn.addEventListener("click", () => {
    const seance = seances.find(s => s.id === btn.dataset.seance);
    unssAppelMembers = membresPourSeance(unssAppelSlotId, seance);
    unssAppelPresence = {};
    unssAppelMembers.forEach(e => {
      const pointee = unssPresences.find(p => p.session_id === seance.id && p.student_id === e.id);
      unssAppelPresence[e.id] = pointee ? !!pointee.present : true;
    });
    chargerDispensesAppel().then(() => renderUnssAppelBody(creneau, seance));
  }));
}

/**
 * Les eleves a pointer sur une seance deja enregistree.
 *
 * Un eleve inscrit cette semaine n'a rien a faire dans l'appel du mois dernier : il n'etait pas
 * la. On ne garde donc que ceux qui etaient deja inscrits a la date de la seance (l'inscription
 * porte sa date dans updated_at, posee a la creation et jamais retouchee ensuite), plus ceux qui
 * y ont deja ete pointes - un eleve retire du creneau depuis ne doit pas disparaitre d'un appel
 * passe qu'il faudrait corriger.
 */
function membresPourSeance(slotId, seance) {
  const tous = elevesDuCreneau(slotId);
  if (!seance) return tous;
  const quand = Number(seance.date_epoch_millis) || 0;
  const dateInscription = id => {
    const ligne = unssInscriptions.find(i => i.slot_id === slotId && i.student_id === id);
    return ligne ? new Date(ligne.updated_at || 0).getTime() : 0;
  };
  const dejaPointes = new Set(unssPresences
    .filter(p => String(p.session_id) === String(seance.id))
    .map(p => String(p.student_id)));
  const retenus = tous.filter(e => dejaPointes.has(String(e.id)) || dateInscription(e.id) <= quand);
  // Un eleve pointe a l'epoque mais retire du creneau depuis reste corrigeable.
  const manquants = unssStudents.filter(e => dejaPointes.has(String(e.id)) && !retenus.some(r => r.id === e.id));
  return [...retenus, ...manquants].sort((a, b) =>
    String(a.last_name || "").localeCompare(String(b.last_name || ""), "fr"));
}

/** Les dispenses du jour, pour prevenir qu'un eleve ne peut pas faire la seance. */
async function chargerDispensesAppel() {
  try {
    const jour = new Date().toISOString().slice(0, 10);
    const [dispenses, elevesDeClasse] = await Promise.all([
      lireTable("health_dispensations", "health_dispensations?deleted=eq.false&select=*"),
      lireTable("students", "students?deleted=eq.false&select=id,last_name,first_name,birth_date_epoch_millis")
    ]);
    unssAppelDispenses = dispensesDuJour(dispenses, elevesDeClasse, jour);
  } catch {
    unssAppelDispenses = new Map();
  }
}


/** L'ancien appel, par groupe. Reste en place tant que schema_as_creneaux.sql n'est pas passe. */
function renderUnssAppelGroupes() {
  const wrap = document.getElementById("unssList");
  wrap.innerHTML = `<label for="unssAppelGroupSelect">Groupe</label>
    <select id="unssAppelGroupSelect">
      <option value="">Choisir...</option>
      ${unssGroups.map(g => `<option value="${g.id}"${g.id === unssAppelGroupId ? " selected" : ""}>${unssText(g.activity_name)}</option>`).join("")}
    </select>
    <div id="unssAppelBody" style="margin-top:14px"></div>`;
  document.getElementById("unssAppelGroupSelect").addEventListener("change", async (e) => {
    unssAppelGroupId = e.target.value || null;
    await loadUnssAppelMembers();
    renderUnssAppelBody(null, null);
  });
  if (unssAppelGroupId) renderUnssAppelBody(null, null);
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

function renderUnssAppelBody(creneau, seance) {
  const body = document.getElementById("unssAppelBody");
  if (!creneau && !unssAppelGroupId) { body.innerHTML = ""; return; }
  if (unssAppelMembers.length === 0) {
    body.innerHTML = creneau
      ? `<div class="muted">Aucun élève inscrit à ce créneau. Ajoutez-en depuis <strong>Créneaux AS</strong>.</div>`
      : `<div class="muted">Ce groupe n'a aucun membre. Ajoutez-en depuis l'onglet Groupe.</div>`;
    return;
  }
  // Une seance deja pointee se rouvre pour correction : on garde sa date, on ne la recree pas.
  const quand = seance ? Number(seance.date_epoch_millis) : Date.now();
  const todayLabel = new Date(quand).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
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
    `<button id="unssAppelSaveBtn" style="margin-top:14px; width:100%">${seance ? "Enregistrer les corrections" : "Enregistrer l'appel"}</button>
     <div class="ok" id="unssAppelOk"></div>`;
  body.querySelectorAll("[data-present]").forEach(btn => btn.addEventListener("click", () => { unssAppelPresence[btn.dataset.present] = true; renderUnssAppelBody(creneau, seance); }));
  body.querySelectorAll("[data-absent]").forEach(btn => btn.addEventListener("click", () => { unssAppelPresence[btn.dataset.absent] = false; renderUnssAppelBody(creneau, seance); }));
  document.getElementById("unssAppelSaveBtn").addEventListener("click", async () => {
    const saveButton = document.getElementById("unssAppelSaveBtn");
    saveButton.disabled = true;
    try {
    // L'appel se fait dans un gymnase, c'est-a-dire souvent sans reseau. La seance et les
    // presences sont retenues ici et partiront a la reconnexion ; la seance d'abord, car une
    // presence qui arriverait seule designerait une seance inexistante.
    const sessionId = seance ? seance.id : crypto.randomUUID();
    const maintenant = new Date().toISOString();
    try {
      const ligneSeance = {
        id: sessionId, user_id: session.user_id,
        date_epoch_millis: quand, label: seance ? (seance.label || "") : "",
        updated_at: maintenant, deleted: false
      };
      if (creneau) ligneSeance.slot_id = creneau.id; else ligneSeance.group_id = unssAppelGroupId;
      await enregistrerLigne("unss_sessions", ligneSeance);
      if (creneau && !seance) unssSeances.unshift(ligneSeance);
      for (const eleve of unssAppelMembers) {
        // Corriger un appel modifie la ligne existante : en creer une seconde ferait compter
        // deux fois le meme eleve dans le bilan.
        const dejaLa = unssPresences.find(p => p.session_id === sessionId && p.student_id === eleve.id);
        const lignePresence = {
          id: dejaLa ? dejaLa.id : crypto.randomUUID(), user_id: session.user_id,
          session_id: sessionId, student_id: eleve.id, present: !!unssAppelPresence[eleve.id],
          updated_at: maintenant, deleted: false
        };
        await enregistrerLigne("unss_attendance", lignePresence);
        if (dejaLa) Object.assign(dejaLa, lignePresence); else unssPresences.push(lignePresence);
      }
    } catch (erreur) {
      saveButton.disabled = false;
      throw new Error(erreur.message || "L'appel n'a pas pu etre enregistre.");
    }
    // L'enseignant choisit après la sauvegarde s'il souhaite déclencher les e-mails.
    if (!confirm("Appel enregistré. Voulez-vous envoyer maintenant un e-mail aux parents des élèves absents ?")) {
      document.getElementById("unssAppelOk").textContent = "Appel enregistré sans envoi d’e-mail.";
      return;
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


// ---- ASLVH > Dates AS : même fiche sur le site et dans l'application -----------------

const AS_DETAILS_PREFIX = "EPS_AS_DETAILS:";
let unssDateEvents = [];
let unssCalendarEvents = [];

function lireDetailsDateAs(commentaire) {
  const brut = String(commentaire || "");
  if (!brut.startsWith(AS_DETAILS_PREFIX)) return {};
  try { return JSON.parse(brut.slice(AS_DETAILS_PREFIX.length)) || {}; } catch { return {}; }
}

function ecrireDetailsDateAs(details) {
  return AS_DETAILS_PREFIX + JSON.stringify(details || {});
}

function dateAsComplete(details) {
  const commun = details.activity && details.accompanyingTeacher && details.exactLocation
    && details.schoolNeeds && details.asNeeds;
  if (!commun) return false;
  return details.travelRequired
    ? !!(details.departureLocation && details.departureTime && details.returnTime && details.transportMethod)
    : !!(details.meetingTime && details.endTime);
}

async function loadUnssDates() {
  unssCalendarEvents = await lireTable("institution_calendar_events",
    "institution_calendar_events?deleted=eq.false&select=*&order=start_date_epoch_millis.asc",
    { ou: e => !e.deleted,
      trier: (a, b) => Number(a.start_date_epoch_millis || 0) - Number(b.start_date_epoch_millis || 0) });
  unssDateEvents = unssCalendarEvents.filter(e => e.kind === "SORTIE");
}

/** Signale tout ce qui occupe déjà la journée, y compris les repères calculés du calendrier. */
function conflitsDateAs(millis, idIgnore) {
  const debutJour = new Date(millis); debutJour.setHours(0, 0, 0, 0);
  const finJour = new Date(millis); finJour.setHours(23, 59, 59, 999);
  const conflits = unssCalendarEvents
    .filter(e => e.id !== idIgnore && !e.deleted
      && Number(e.start_date_epoch_millis || 0) <= finJour.getTime()
      && Number(e.end_date_epoch_millis || e.start_date_epoch_millis || 0) >= debutJour.getTime())
    .map(e => e.label || "Événement sans titre");
  const iso = new Date(millis).toISOString().slice(0, 10);
  if (typeof CAL_FIXES !== "undefined" && CAL_FIXES[iso]) conflits.push(CAL_FIXES[iso][0]);
  if (typeof calEnVacances === "function" && calEnVacances(iso)) conflits.push("Vacances scolaires");
  if (typeof datesCcfBac === "function") {
    datesCcfBac().filter(e => e.lundi === iso || e.jeudi === iso)
      .forEach(e => conflits.push(`BAC EPS CCF${e.numero || ""}`));
  }
  return [...new Set(conflits.filter(Boolean))];
}

function renderUnssDatesTab() {
  const wrap = document.getElementById("unssList");
  const maintenant = new Date(); maintenant.setHours(0, 0, 0, 0);
  const aVenir = unssDateEvents.filter(e => Number(e.end_date_epoch_millis || e.start_date_epoch_millis) >= maintenant.getTime());
  const passees = unssDateEvents.filter(e => Number(e.end_date_epoch_millis || e.start_date_epoch_millis) < maintenant.getTime());
  const cartes = rows => rows.map(e => {
    const d = new Date(Number(e.start_date_epoch_millis));
    const details = lireDetailsDateAs(e.comment);
    const complete = dateAsComplete(details);
    return `<button class="as-date-card" data-as-date="${e.id}"><span class="as-date-day"><b>${d.getDate()}</b><small>${d.toLocaleDateString("fr-FR", { month:"short" }).replace(".", "")}</small></span><span><b>${unssText(e.label || "Sortie AS")}</b><small>${unssText(d.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" }))}</small>${details.activity ? `<em>${unssText(details.activity)}${details.exactLocation ? ` · ${unssText(details.exactLocation)}` : ""}</em>` : ""}</span><i class="${complete ? "complete" : "pending"}">${complete ? "Fiche complétée" : "À remplir"}</i><strong>›</strong></button>`;
  }).join("");
  wrap.innerHTML = `<div class="as-dates-page"><nav class="as-call-breadcrumb" aria-label="Fil d’Ariane"><span>ASLVH</span><i>›</i><b>Dates AS</b></nav><header class="as-dates-compact"><div><h1>Dates AS</h1><p>Rencontres, déplacements et besoins partagés avec l’application.</p></div><button id="asDateAdd">＋ Ajouter une date AS</button></header><section class="as-dates-summary"><article><b>${aVenir.length}</b><span>À venir</span></article><article><b>${unssDateEvents.filter(e => dateAsComplete(lireDetailsDateAs(e.comment))).length}</b><span>Fiches complétées</span></article><article><b>${unssDateEvents.length}</b><span>Dates partagées</span></article></section><section class="as-dates-section"><div class="as-dates-heading"><div><span>PROCHAINES DATES</span><h2>Événements à préparer</h2></div></div>${aVenir.length ? `<div class="as-date-list">${cartes(aVenir)}</div>` : `<div class="as-call-empty">Aucune date AS à venir.</div>`}</section>${passees.length ? `<details class="as-dates-past"><summary>Dates passées (${passees.length})</summary><div class="as-date-list">${cartes(passees.reverse())}</div></details>` : ""}</div>`;
  document.getElementById("asDateAdd").onclick = () => openUnssDatePanel(null);
  wrap.querySelectorAll("[data-as-date]").forEach(btn => btn.onclick = () => {
    const event = unssDateEvents.find(e => e.id === btn.dataset.asDate);
    if (event) openUnssDatePanel(event);
  });
}

function openUnssDatePanel(event) {
  const nouveau = !event;
  const details = lireDetailsDateAs(event?.comment);
  const dateIso = event ? new Date(Number(event.start_date_epoch_millis)).toISOString().slice(0, 10) : "";
  const panel = document.getElementById("unssPanel");
  ouvrirFenetreUnss(); panel.classList.add("as-full-panel", "as-date-panel");
  panel.innerHTML = `<div class="as-panel-title"><button class="as-back" id="asDateClose">←</button><div><small>DATE AS</small><h2>${nouveau ? "Nouvelle date AS" : unssText(event.label)}</h2></div><b>📅</b></div><div class="as-date-form"><section class="as-date-form-card"><h3>🏆 L’événement</h3><div class="as-form-grid"><label>Date<input id="asDateValue" type="date" value="${dateIso}"></label><label>Intitulé<input id="asDateLabel" value="${unssText(event?.label || "")}" placeholder="Ex : Cross départemental"></label><label>Activité<input id="asDateActivity" value="${unssText(details.activity || "")}" placeholder="Ex : Cross-country"></label><label>Professeurs accompagnants<textarea id="asDateTeachers" rows="2" placeholder="Un nom par ligne">${unssText(details.accompanyingTeacher || "")}</textarea></label></div></section><section class="as-date-form-card"><h3>⌖ Destination</h3><label>Lieu exact de la sortie<input id="asDateLocation" value="${unssText(details.exactLocation || "")}"></label></section><section class="as-date-form-card"><h3>🚌 Déplacement</h3><label class="as-travel-toggle"><input id="asDateTravel" type="checkbox" ${details.travelRequired ? "checked" : ""}><span>Un déplacement est nécessaire</span></label><div id="asDateTravelFields" class="as-form-grid"><label>Lieu de départ<input id="asDateDepartureLocation" value="${unssText(details.departureLocation || "")}"></label><label>Départ<input id="asDateDeparture" type="time" value="${unssText(details.departureTime || "")}"></label><label>Retour<input id="asDateReturn" type="time" value="${unssText(details.returnTime || "")}"></label><label>Moyen de déplacement<input id="asDateTransport" value="${unssText(details.transportMethod || "")}"></label></div><div id="asDateNoTravelFields" class="as-form-grid"><label>Heure de rendez-vous<input id="asDateMeeting" type="time" value="${unssText(details.meetingTime || "")}"></label><label>Heure de fin<input id="asDateEnd" type="time" value="${unssText(details.endTime || "")}"></label></div></section><div class="as-needs-grid"><section class="as-date-form-card"><h3>🏫 Besoins établissement</h3><textarea id="asDateSchoolNeeds" rows="5" placeholder="Un besoin par ligne">${unssText(details.schoolNeeds || "")}</textarea></section><section class="as-date-form-card needs"><h3>⭐ Besoins AS</h3><textarea id="asDateAsNeeds" rows="5" placeholder="Un besoin par ligne">${unssText(details.asNeeds || "")}</textarea></section></div><div class="as-date-actions"><button id="asDateSave">Enregistrer la fiche</button>${nouveau ? "" : `<button class="danger" id="asDateDelete">Supprimer la date</button>`}<button class="secondary" id="asDateCancel">Annuler</button></div><div class="error" id="asDateError"></div></div>`;
  const travel = document.getElementById("asDateTravel");
  const toggleTravel = () => { document.getElementById("asDateTravelFields").style.display = travel.checked ? "grid" : "none"; document.getElementById("asDateNoTravelFields").style.display = travel.checked ? "none" : "grid"; };
  travel.onchange = toggleTravel; toggleTravel();
  document.getElementById("asDateClose").onclick = fermerFenetreUnss;
  document.getElementById("asDateCancel").onclick = fermerFenetreUnss;
  document.getElementById("asDateSave").onclick = async () => {
    const error = document.getElementById("asDateError");
    const date = document.getElementById("asDateValue").value;
    const label = document.getElementById("asDateLabel").value.trim();
    if (!date || !label) { error.textContent = "Indiquez la date et l’intitulé."; return; }
    const valeur = id => document.getElementById(id).value.trim();
    const nouveauxDetails = { activity:valeur("asDateActivity"), accompanyingTeacher:valeur("asDateTeachers"), exactLocation:valeur("asDateLocation"), travelRequired:travel.checked, departureLocation:valeur("asDateDepartureLocation"), departureTime:valeur("asDateDeparture"), returnTime:valeur("asDateReturn"), transportMethod:valeur("asDateTransport"), meetingTime:valeur("asDateMeeting"), endTime:valeur("asDateEnd"), schoolNeeds:valeur("asDateSchoolNeeds"), asNeeds:valeur("asDateAsNeeds") };
    const millis = new Date(date + "T12:00:00").getTime();
    const conflits = conflitsDateAs(millis, event?.id);
    if (conflits.length && !confirm(`Conflit de calendrier le ${new Date(millis).toLocaleDateString("fr-FR")} :\n\n• ${conflits.join("\n• ")}\n\nEnregistrer quand même cette date AS ?`)) {
      error.textContent = "Enregistrement annulé : choisissez une autre date ou confirmez le conflit.";
      return;
    }
    const ligne = Object.assign({}, event || {}, { id:event?.id || crypto.randomUUID(), user_id:event?.user_id || session.user_id, label, kind:"SORTIE", start_date_epoch_millis:millis, end_date_epoch_millis:millis, comment:ecrireDetailsDateAs(nouveauxDetails), deleted:false, updated_at:new Date().toISOString() });
    try { await enregistrerLigne("institution_calendar_events", ligne); await loadUnssDates(); if (typeof loadInstitutionCalendar === "function") await loadInstitutionCalendar(); fermerFenetreUnss(); renderUnssDatesTab(); }
    catch (e) { error.textContent = e.message || "Enregistrement impossible."; }
  };
  document.getElementById("asDateDelete")?.addEventListener("click", async () => {
    if (!confirm(`Supprimer la date AS « ${event.label} » ?`)) return;
    await supprimerLigne("institution_calendar_events", event.id); await loadUnssDates(); if (typeof loadInstitutionCalendar === "function") await loadInstitutionCalendar(); fermerFenetreUnss(); renderUnssDatesTab();
  });
}

/** Redessine ASLVH quand une synchronisation ramene des saisies faites ailleurs. */
globalThis.rafraichirAslvhApresSynchro = async () => {
  if (!document.getElementById("unssList")) return;
  await verifierCreneauPorteTout();
  await Promise.all([loadUnssStudents(), loadUnssSlots(), loadUnssGroups(), loadUnssDates()]);
  await loadUnssInscriptions();
  // L'onglet Groupe ne sert plus une fois que le creneau porte tout : on le retire de la barre
  // plutot que de laisser deux chemins pour la meme chose.
  // Cache par defaut dans le HTML : ne le montrer que si la migration n'est pas encore
  // appliquee, plutot que de le retirer apres coup (evite l'apparition breve au chargement).
  const ongletGroupe = document.querySelector('#unssSubtabs [data-unsstab="groups"]');
  if (ongletGroupe) ongletGroupe.style.display = creneauPorteTout ? "none" : "";
  if (creneauPorteTout && unssMode === "groups") unssMode = "slots";
  renderUnssTab();
};
