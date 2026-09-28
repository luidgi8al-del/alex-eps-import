/*
 * Verrouillage par code, recherche globale et carte du jour de l'accueil.
 *
 * Sorti d'index.html. Script classique, comme les dix autres fichiers du site :
 * les fonctions restent accessibles depuis les autres fichiers sans rien exporter,
 * et ce fichier est charge avant le script principal qui s'en sert.
 */

// ---- Verrouillage par code ----
function maybeLock() {
  const prefs = loadPrefs();
  if (!prefs.pin) return;
  document.getElementById("lockOverlay").classList.add("open");
  document.getElementById("lockInput").value = "";
  document.getElementById("lockInput").focus();
}

function tryUnlock() {
  const prefs = loadPrefs();
  const value = document.getElementById("lockInput").value.trim();
  if (value === prefs.pin) {
    document.getElementById("lockOverlay").classList.remove("open");
    document.getElementById("lockError").textContent = "";
  } else {
    document.getElementById("lockError").textContent = "Code incorrect.";
  }
}

document.getElementById("lockSubmit").addEventListener("click", tryUnlock);
document.getElementById("lockInput").addEventListener("keydown", e => {
  if (e.key === "Enter") tryUnlock();
});

// ---- Recherche globale (miroir de SearchScreen.kt) ----
// Cherche a partir de deux caracteres dans les eleves, classes, cours, materiel, EPI et
// groupes UNSS, et emmene directement sur l'onglet concerne.

let searchDebounce = null;

function openSearch() {
  document.getElementById("searchOverlay").classList.add("open");
  const input = document.getElementById("searchInput");
  input.value = "";
  document.getElementById("searchResults").innerHTML =
    '<div class="muted">Tapez au moins deux caracteres.</div>';
  input.focus();
}

function closeSearch() {
  document.getElementById("searchOverlay").classList.remove("open");
}

function searchNormalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

async function runGlobalSearch(query) {
  const resultsEl = document.getElementById("searchResults");
  const q = searchNormalize(query.trim());
  if (q.length < 2) {
    resultsEl.innerHTML = '<div class="muted">Tapez au moins deux caracteres.</div>';
    return;
  }
  resultsEl.innerHTML = '<div class="muted">Recherche...</div>';

  // Chaque source est facultative : une table absente ne doit pas casser la recherche.
  const fetchJson = async (path) => {
    try {
      const res = await apiFetch(`${SUPABASE_URL}/rest/v1/${path}`);
      return res.ok ? await res.json() : [];
    } catch (e) { return []; }
  };

  const [classes, students, cycles, equip, epis, groups] = await Promise.all([
    fetchJson("classes?deleted=eq.false&select=id,name,school_year,grade"),
    fetchJson("students?deleted=eq.false&select=id,first_name,last_name,class_id"),
    fetchJson("cycles?deleted=eq.false&select=id,apsa_name,grade,session_count"),
    fetchJson("equipment?deleted=eq.false&select=id,name,category,location"),
    fetchJson("epi_items?deleted=eq.false&select=id,internal_id,manufacturer,model"),
    fetchJson("unss_groups?deleted=eq.false&select=id,activity_name,responsible_teacher")
  ]);

  const classById = {};
  classes.forEach(c => { classById[c.id] = c.name; });

  const hits = [];
  const push = (category, title, subtitle, tab) => hits.push({ category, title, subtitle, tab });
  const match = (...values) => values.some(v => searchNormalize(v).includes(q));

  classes.forEach(c => { if (match(c.name, c.school_year)) push("Classe", c.name, c.school_year || "", "classes"); });
  students.forEach(s => {
    if (match(s.last_name, s.first_name)) {
      push("Eleve", `${(s.last_name || "").toUpperCase()} ${s.first_name || ""}`.trim(), classById[s.class_id] || "", "classes");
    }
  });
  cycles.forEach(c => { if (match(c.apsa_name)) push("Cours", c.apsa_name, `${GRADE_LABELS[c.grade] || c.grade} · ${c.session_count} seances`, "cours"); });
  equip.forEach(e => { if (match(e.name, e.location)) push("Materiel", e.name, e.location || "", "equipement"); });
  epis.forEach(e => { if (match(e.internal_id, e.manufacturer, e.model)) push("EPI", e.internal_id, [e.manufacturer, e.model].filter(Boolean).join(" "), "equipement"); });
  groups.forEach(g => { if (match(g.activity_name, g.responsible_teacher)) push("UNSS", g.activity_name, g.responsible_teacher || "", "unss"); });

  resultsEl.innerHTML = hits.length === 0
    ? `<div class="muted">Aucun resultat pour « ${query} ».</div>`
    : hits.slice(0, 60).map((h, i) => `<button class="searchHit" data-hit="${i}">
        <span class="cat">${h.category}</span>
        <span class="ttl">${h.title}</span>
        ${h.subtitle ? `<div class="muted">${h.subtitle}</div>` : ""}
      </button>`).join("");

  resultsEl.querySelectorAll("[data-hit]").forEach(b =>
    b.onclick = () => { closeSearch(); showTab(hits[Number(b.dataset.hit)].tab); });
}

document.getElementById("searchBtn").addEventListener("click", openSearch);
document.getElementById("searchClose").addEventListener("click", closeSearch);
document.getElementById("searchOverlay").addEventListener("click", e => {
  if (e.target.id === "searchOverlay") closeSearch();
});
document.getElementById("searchInput").addEventListener("input", e => {
  clearTimeout(searchDebounce);
  const value = e.target.value;
  searchDebounce = setTimeout(() => runGlobalSearch(value), 220);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeSearch();
});

// ---- Accueil : carte du jour et acces aux modules (miroir de HomeScreen.kt) ----
// On compte tous les creneaux du jour. Le creneau mis en avant reste le cours en cours,
// puis bascule sur le suivant trente minutes avant sa fin : ce court chevauchement aide le
// professeur a anticiper son deplacement et son materiel. Pour le dernier cours, la carte
// annonce qu'il n'y en a plus a partir de ses trente dernieres minutes.
document.querySelectorAll("[data-goto]").forEach(card => {
  const openMainModule = event => {
    // Le petit encadré possède une destination plus précise (favoris, dates AS ou BAC).
    // Son clic ne doit donc pas remonter jusqu'à la grande carte.
    if (event.target.closest("[data-home-module]")) return;
    showTab(card.dataset.goto);
  };
  card.addEventListener("click", openMainModule);
  card.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && !event.target.closest("[data-home-module]")) {
      event.preventDefault();
      showTab(card.dataset.goto);
    }
  });
});
document.querySelectorAll("[data-home-shortcut]").forEach(button =>
  button.addEventListener("click", () => {
    const target = button.dataset.homeShortcut;
    if (target === "dispenses" && typeof globalThis.ouvrirDispensesDepuisAccueil === "function") {
      globalThis.ouvrirDispensesDepuisAccueil();
    } else if (target === "evaluations") {
      globalThis.vueClasseAccueilDemandee = "evaluations";
      showTab("classes");
    } else if (target === "students") {
      showTab("students");
    } else {
      showTab("classes");
    }
  })
);
document.querySelectorAll("[data-home-module]").forEach(button =>
  button.addEventListener("click", () => {
    const target = button.dataset.homeModule;
    if (target === "tools" && typeof globalThis.ouvrirFavorisDepuisAccueil === "function") {
      globalThis.ouvrirFavorisDepuisAccueil();
    } else if (target === "unss") {
      showTab("unss");
      Promise.resolve(initUnssTab()).then(() => showUnssTab("dates")).catch(() => {});
    } else if (target === "bac") {
      globalThis.planningAccueilTabDemandee = "bac";
      showTab("programmation");
    } else {
      showTab("equipement");
    }
  })
);
document.getElementById("todayCard").addEventListener("click", () => showTab("planning"));

function homeSummaryText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function formatHomeEventDate(value) {
  const date = new Date(Number(value));
  if (!Number.isFinite(date.getTime())) return "Date à préciser";
  return date.toLocaleDateString("fr-FR", { weekday:"short", day:"numeric", month:"short" }).replace(".", "");
}

async function loadHomeModuleSummaries() {
  const favorite = typeof globalThis.homeFavoriteToolSummary === "function"
    ? globalThis.homeFavoriteToolSummary() : null;
  homeSummaryText("homeToolsSummary", favorite?.title || "Mes favoris");
  homeSummaryText("homeToolsMeta", favorite?.count
    ? `${favorite.count} favori${favorite.count > 1 ? "s" : ""} disponible${favorite.count > 1 ? "s" : ""}`
    : "Choisissez un outil favori");

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  try {
    const events = await lireTable("institution_calendar_events",
      "institution_calendar_events?deleted=eq.false&kind=eq.SORTIE&select=*&order=start_date_epoch_millis.asc",
      { ou:event => !event.deleted && event.kind === "SORTIE",
        trier:(a,b) => Number(a.start_date_epoch_millis || 0) - Number(b.start_date_epoch_millis || 0) });
    const next = events.find(event => Number(event.end_date_epoch_millis || event.start_date_epoch_millis || 0) >= todayStart.getTime());
    homeSummaryText("homeAsSummary", next?.label || "Aucun événement prévu");
    homeSummaryText("homeAsMeta", next ? formatHomeEventDate(next.start_date_epoch_millis) : "Ajouter une date AS");
  } catch {
    homeSummaryText("homeAsSummary", "Événements indisponibles");
    homeSummaryText("homeAsMeta", "Ouvrir les dates AS");
  }

  try {
    const incidents = await lireTable("sport_installation_incidents",
      "sport_installation_incidents?deleted=eq.false&select=*&order=reported_at.desc",
      { ou:incident => !incident.deleted,
        trier:(a,b) => String(b.reported_at || "").localeCompare(String(a.reported_at || "")) });
    const active = incidents.filter(incident => incident.status !== "RESOLU");
    const first = active[0];
    homeSummaryText("homeEquipmentSummary", first?.installation_name || "Aucun problème signalé");
    homeSummaryText("homeEquipmentMeta", active.length
      ? `${active.length} signalement${active.length > 1 ? "s" : ""} en cours`
      : "Toutes les installations sont disponibles");
  } catch {
    homeSummaryText("homeEquipmentSummary", "Suivi indisponible");
    homeSummaryText("homeEquipmentMeta", "Ouvrir les installations");
  }
}

function slotStartMinutes(slot) {
  const parts = String(slot.start_time || "").trim().replace("h", ":").split(":");
  const hour = parseInt(parts[0], 10);
  if (isNaN(hour)) return Number.MAX_SAFE_INTEGER;
  return hour * 60 + (parseInt(parts[1], 10) || 0);
}

function slotPreviewEndMinutes(slot) {
  const start = slotStartMinutes(slot);
  const duration = Number(slot.duration_minutes);
  // duration_minutes est obligatoire dans la base. Cette valeur de repli evite toutefois
  // qu'une ancienne copie locale incomplete reste affichee toute la journee.
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 60;
  return start + Math.max(0, safeDuration - 30);
}

function nextTodaySlot(today, nowMinutes) {
  return today.find(slot => nowMinutes < slotPreviewEndMinutes(slot)) || null;
}

function remainingTodaySlots(today, nowMinutes) {
  const nextIndex = today.findIndex(slot => nowMinutes < slotPreviewEndMinutes(slot));
  return nextIndex < 0 ? 0 : today.length - nextIndex;
}

let todayCardSnapshot = null;

function renderTodayCardNow(now = new Date()) {
  if (!todayCardSnapshot) return;
  const countEl = document.getElementById("todayCount");
  const nextEl = document.getElementById("todayNext");
  const { today, classes } = todayCardSnapshot;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const next = nextTodaySlot(today, nowMinutes);
  const remaining = remainingTodaySlots(today, nowMinutes);

  countEl.textContent = `${remaining} cours`;
  if (today.length === 0) {
    nextEl.textContent = "Aucun cours aujourd'hui";
  } else if (!next) {
    nextEl.textContent = "Plus de cours aujourd'hui";
  } else {
    const cls = classes.find(c => c.id === next.class_id);
    nextEl.textContent = `Prochain · ${cls ? cls.name : "Classe"} · ${next.start_time || ""}`;
  }
}

async function loadTodayCard() {
  const countEl = document.getElementById("todayCount");
  const nextEl = document.getElementById("todayNext");
  try {
    // La lecture des creneaux est ouverte a tout l'etablissement (c'est ce qui fait vivre
    // Planning global EPS). Sans filtre sur le compte, cette carte comptait donc les cours de
    // tous les collegues reunis : il faut demander explicitement les siens.
    // C'est le premier ecran, souvent ouvert en arrivant au gymnase : il doit repondre meme
    // sans reseau. D'ou la copie locale.
    const [slots, classes] = await Promise.all([
      lireTable("class_schedule_slots",
        `class_schedule_slots?deleted=eq.false&user_id=eq.${session.user_id}&select=*`,
        { ou: c => c.user_id === session.user_id }),
      lireTable("classes", "classes?deleted=eq.false&select=id,name")
    ]);

    const today = slots
      .filter(s => s.day_of_week === TODAY_DAY_KEY)
      .sort((a, b) => slotStartMinutes(a) - slotStartMinutes(b));

    todayCardSnapshot = { today, classes };
    renderTodayCardNow();
  } catch (e) {
    todayCardSnapshot = null;
    countEl.textContent = "—";
    nextEl.textContent = "Planning indisponible";
  }
}

// La page peut rester ouverte pendant tout un cours. Recalculer l'affichage localement permet
// le passage de 08:00 a 10:00 exactement au bon moment, sans nouvelle requete reseau.
setInterval(renderTodayCardNow, 30 * 1000);
