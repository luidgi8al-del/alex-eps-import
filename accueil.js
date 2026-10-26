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
// Résultats liés à leur identifiant, jamais à la première fiche d'une rubrique.

let searchDebounce = null;
const globalSearchState = { generation: 0, query: 0, owner: null, opened: false, loading: null, records: [], warnings: [], local: false, navigating: false, returnFocus: null };
const searchOwner = () => typeof session !== 'undefined' ? session?.user_id : null;
const searchEsc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function searchAllowed() {
  const owner = searchOwner();
  return !!owner && localStorage.getItem('eps:installation-manager-role:' + owner) === 'false';
}
function searchCurrent(epoch = globalSearchState.generation, owner = globalSearchState.owner) {
  return globalSearchState.opened && epoch === globalSearchState.generation && owner === searchOwner() && searchAllowed();
}
function resetGlobalSearch() {
  clearTimeout(searchDebounce);
  globalSearchState.generation++; globalSearchState.query++;
  globalSearchState.opened = false; globalSearchState.owner = null;
  globalSearchState.loading = null; globalSearchState.records = []; globalSearchState.warnings = [];
  globalSearchState.navigating = false; globalSearchState.local = false;
  document.getElementById('searchOverlay').classList.remove('open');
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').replaceChildren();
}

function openSearch() {
  resetGlobalSearch();
  if (!searchAllowed()) return;
  globalSearchState.opened = true; globalSearchState.owner = searchOwner();
  globalSearchState.returnFocus = document.activeElement;
  document.getElementById("searchOverlay").classList.add("open");
  const input = document.getElementById("searchInput");
  input.value = "";
  document.getElementById("searchResults").innerHTML =
    '<div class="muted" role="status">Tapez au moins deux caractères : élève, classe, matériel, outil ou chapitre EPPCS.</div>';
  input.focus();
}

function closeSearch({ restoreFocus = true } = {}) {
  const previous = globalSearchState.returnFocus;
  resetGlobalSearch();
  if (restoreFocus && previous?.isConnected && previous.getClientRects().length) previous.focus();
}

function searchNormalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[×✕]/g, 'x').replace(/(\d)\s*x\s*(?=\d)/g, '$1x')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function searchToolRecords() {
  const records = (globalThis.EpsToolsCatalog || []).map(t => ({ kind:'tool', id:t.id, category:'Outil', title:t.title, subtitle:t.subtitle, keywords:(t.activities || []).join(' ') }));
  const tests = typeof EpsTests !== 'undefined' ? EpsTests.TESTS : globalThis.EpsTests?.TESTS;
  Object.entries(tests || {}).forEach(([id,t]) => records.push({kind:'tool',id:'eps-test:' + id,category:'Test EPS',title:t.label,subtitle:'Ouvrir le test',keywords:t.protocol || ''}));
  return records;
}
async function loadGlobalSearchRecords(epoch, owner) {
  const current = () => searchCurrent(epoch, owner);
  const warnings = [], tables = Object.create(null);
  let local = false;
  const definitions = [
    ['classes','Classes','id,name,school_year,grade'],
    ['students','Élèves','id,first_name,last_name,class_id'],
    ['cycles','Cours','id,apsa_name,grade,session_count,class_id'],
    ['equipment','Matériel','id,name,category,location'],
    ['epi_items','EPI','id,internal_id,manufacturer,model,location']
  ];
  await Promise.all(definitions.map(async ([table,label,fields]) => {
    try {
      let rows;
      if (typeof tableSuivie === 'function' && tableSuivie(table)) {
        const result = await modeHorsConnexion.lire(table);
        rows = result.rows; local ||= result.source !== 'reseau';
      } else {
        const url = SUPABASE_URL + '/rest/v1/' + table + '?deleted=eq.false&select=' + fields;
        if (typeof apiFetchAll === 'function') {
          const response = await apiFetchAll(url);
          if (!response.ok) throw Error('Lecture indisponible');
          rows = response.rows;
        } else {
          const response = await apiFetch(url);
          if (!response.ok) throw Error('Lecture indisponible');
          rows = await response.json();
        }
      }
      if (!Array.isArray(rows)) throw Error('Lecture indisponible');
      tables[table] = rows.filter(row => row && row.id && !row.deleted);
    } catch { tables[table] = []; warnings.push(label); }
  }));
  if (!current()) return;
  const records = searchToolRecords(), classes = new Map(tables.classes.map(c => [String(c.id), c.name]));
  const add = (kind,id,category,title,subtitle,keywords = '') => records.push({kind,id:String(id),category,title:String(title || ''),subtitle:String(subtitle || ''),keywords});
  tables.classes.forEach(c => add('class',c.id,'Classe',c.name,c.school_year));
  tables.students.forEach(s => add('student',s.id,'Élève',String(s.last_name || '').toUpperCase() + ' ' + (s.first_name || ''),classes.get(String(s.class_id))));
  tables.cycles.forEach(c => add('course',c.id,'Cours',c.apsa_name,[classes.get(String(c.class_id)), (typeof GRADE_LABELS !== 'undefined' && GRADE_LABELS[c.grade]) || c.grade, (c.session_count || 0) + ' séances'].filter(Boolean).join(' · ')));
  tables.equipment.forEach(e => add('equipment',e.id,'Matériel',e.name,e.location,e.category));
  tables.epi_items.forEach(e => add('epi',e.id,'EPI',e.internal_id,[e.manufacturer,e.model,e.location].filter(Boolean).join(' · ')));
  try {
    if (!globalThis.EPSAtelierEPPCS?.searchChapters) throw Error('Atelier indisponible');
    const chapters = await EPSAtelierEPPCS.searchChapters({isCurrent:current});
    chapters.forEach(c => add('eppcs',c.id,'EPPCS',c.title,c.theme,c.question));
  } catch { warnings.push('EPPCS'); }
  if (!current()) return;
  globalSearchState.records = records; globalSearchState.warnings = warnings; globalSearchState.local = local;
}
function globalSearchHits(query) {
  const q = searchNormalize(query), terms = q.split(' ').filter(Boolean);
  return globalSearchState.records.filter(h => {
    const text = searchNormalize([h.title,h.subtitle,h.keywords].join(' '));
    return terms.every(term => text.includes(term));
  }).sort((a,b) => Number(searchNormalize(b.title) === q) - Number(searchNormalize(a.title) === q) || a.title.localeCompare(b.title,'fr'));
}
function renderGlobalSearch(query, loading = false) {
  if (!searchCurrent() || globalSearchState.navigating) return;
  const resultsEl = document.getElementById('searchResults'), all = globalSearchHits(query), hits = all.slice(0,60);
  let info = loading ? '<p class="muted" role="status">Recherche en cours… Les outils disponibles peuvent déjà être ouverts.</p>' : '';
  if (!loading && globalSearchState.warnings.length) info += '<p class="searchNotice" role="status">Recherche partielle : ' + searchEsc(globalSearchState.warnings.join(', ')) + ' indisponible(s). Réessayez avec une connexion ; aucun résultat n’a été supprimé.</p><button type="button" class="secondary" data-search-retry>Réessayer</button>';
  if (!loading && (globalSearchState.local || navigator.onLine === false)) info += '<p class="muted">Recherche dans les données disponibles sur cet appareil. Si un élément manque, synchronisez lorsque la connexion revient.</p>';
  if (!hits.length && !loading) info += '<p class="muted" role="status">Aucun résultat dans les données disponibles pour « ' + searchEsc(query) + ' ».</p>';
  if (all.length > 60) info += '<p class="muted">60 premiers résultats. Précisez votre recherche.</p>';
  resultsEl.innerHTML = info + hits.map((h,i) => '<button type="button" class="searchHit" data-hit="' + i + '" data-search-kind="' + h.kind + '"><span class="cat">' + h.category + '</span><span class="ttl">' + searchEsc(h.title) + '</span>' + (h.subtitle ? '<span class="muted">' + searchEsc(h.subtitle) + '</span>' : '') + '</button>').join('') + '<p data-search-action-status role="status"></p>';
  const epoch = globalSearchState.generation, owner = globalSearchState.owner;
  resultsEl.querySelectorAll('[data-hit]').forEach(button => button.onclick = () => openGlobalSearchHit(hits[Number(button.dataset.hit)], epoch, owner));
  resultsEl.querySelector('[data-search-retry]')?.addEventListener('click', () => { globalSearchState.loading = null; void runGlobalSearch(document.getElementById('searchInput').value); });
}
function searchNavigationGuard(kind) {
  if (globalThis.EpsGlobalSearchTools?.isOpening?.()) throw Error('Un outil est encore en cours d’ouverture. Attendez la fin du chargement avant d’ouvrir un autre résultat.');
  const tool = [...document.querySelectorAll('#toolPanel,#liveToolPanel')].some(panel => panel.children.length && panel.style.display !== 'none' && panel.getClientRects().length);
  if (tool) throw Error('Un outil est ouvert. Enregistrez votre travail si nécessaire, puis fermez cet outil avant d’ouvrir un autre résultat.');
  if (kind !== 'eppcs' && globalThis.EPSAtelierEPPCS?.hasUnsavedDraft?.()) throw Error('Enregistrez vos notes EPPCS avant d’ouvrir ce résultat. Votre brouillon est conservé.');
}
async function openGlobalSearchHit(hit, epoch, owner) {
  const current = () => searchCurrent(epoch, owner);
  if (!hit || !current() || globalSearchState.navigating) return;
  const feedback = document.querySelector('[data-search-action-status]');
  try {
    searchNavigationGuard(hit.kind);
    globalSearchState.navigating = true;
    if (feedback) feedback.textContent = 'Ouverture de « ' + hit.title + ' »…';
    const options = {isCurrent:current};
    let opened;
    if (hit.kind === 'tool') opened = await globalThis.EpsGlobalSearchTools.open(hit.id, options);
    else if (hit.kind === 'eppcs') opened = await EPSAtelierEPPCS.openChapter(hit.id, options);
    else if (hit.kind === 'course') opened = await openCourseFromSearch(hit.id, options);
    else opened = await EPSGlobalSearchEntities.open(hit.kind, hit.id, options);
    if (!current()) return;
    if (opened === false) throw Error('L’ouverture a été interrompue. Votre travail est conservé ; relancez la recherche.');
    closeSearch({restoreFocus:false});
  } catch (error) {
    if (current() && feedback) feedback.textContent = error instanceof TypeError ? 'Ce résultat ne peut pas être ouvert pour le moment. Rechargez le site puis réessayez.' : (error?.message || 'Ouverture impossible. Réessayez.');
  } finally { if (current()) globalSearchState.navigating = false; }
}
async function runGlobalSearch(query) {
  if (!searchCurrent()) { if (globalSearchState.opened) resetGlobalSearch(); return; }
  const token = ++globalSearchState.query, epoch = globalSearchState.generation, owner = globalSearchState.owner;
  if (searchNormalize(query).length < 2) {
    document.getElementById('searchResults').innerHTML = '<div class="muted" role="status">Tapez au moins deux caractères.</div>';
    return;
  }
  if (!globalSearchState.loading) {
    globalSearchState.records = searchToolRecords(); globalSearchState.warnings = [];
    globalSearchState.loading = loadGlobalSearchRecords(epoch,owner);
  }
  renderGlobalSearch(query,true);
  await globalSearchState.loading;
  if (searchCurrent(epoch,owner) && token === globalSearchState.query) renderGlobalSearch(query);
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
  if (e.key === "Escape" && globalSearchState.opened) closeSearch();
});
window.addEventListener('storage', event => { if (event.key === 'alex_eps_session') resetGlobalSearch(); });
globalThis.EPSGlobalSearch = Object.freeze({reset:resetGlobalSearch});

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

// Sur telephone, l'alerte rejoint le resume du jour. Le MutationObserver garde ce resume a jour
// lorsque la source de l'alerte sera alimentee, sans dupliquer sa logique metier.
function syncHomeMobileAlert() {
  const source = document.getElementById("homeAlertContent");
  const target = document.getElementById("homeMobileAlert");
  if (!source || !target) return;
  const message = source.textContent.trim();
  const hasAlert = Boolean(message) && message.toLocaleLowerCase("fr-FR") !== "aucune alerte";
  target.textContent = hasAlert ? `⚠️ ${message}` : "";
  target.hidden = !hasAlert;
}
syncHomeMobileAlert();
const homeAlertSource = document.getElementById("homeAlertContent");
if (homeAlertSource) new MutationObserver(syncHomeMobileAlert).observe(homeAlertSource, { childList:true, subtree:true, characterData:true });

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
    const datesAs = events.filter(event => !String(event.comment || "").startsWith("Calendrier établissement LVH"));
    const next = datesAs.find(event => Number(event.end_date_epoch_millis || event.start_date_epoch_millis || 0) >= todayStart.getTime());
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
