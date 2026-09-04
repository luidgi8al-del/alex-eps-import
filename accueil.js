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
// Meme regle que TodayCard : on compte les creneaux du jour et on annonce le prochain,
// c'est-a-dire le premier qui n'a pas encore commence, sinon le premier de la journee.
document.querySelectorAll("[data-goto]").forEach(b =>
  b.addEventListener("click", () => showTab(b.dataset.goto))
);
document.getElementById("todayCard").addEventListener("click", () => showTab("planning"));

function slotStartMinutes(slot) {
  const parts = String(slot.start_time || "").trim().replace("h", ":").split(":");
  const hour = parseInt(parts[0], 10);
  if (isNaN(hour)) return Number.MAX_SAFE_INTEGER;
  return hour * 60 + (parseInt(parts[1], 10) || 0);
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

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const next = today.find(s => slotStartMinutes(s) >= nowMinutes) || today[0];

    countEl.textContent = `${today.length} cours`;
    if (!next) {
      nextEl.textContent = "Aucun cours aujourd'hui";
    } else {
      const cls = classes.find(c => c.id === next.class_id);
      nextEl.textContent = `Prochain · ${cls ? cls.name : "Classe"} · ${next.start_time || ""}`;
    }
  } catch (e) {
    countEl.textContent = "—";
    nextEl.textContent = "Planning indisponible";
  }
}
