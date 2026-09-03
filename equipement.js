/*
 * Onglet EQUIPEMENT : installations sportives, materiel EPS et EPI escalade.
 *
 * Sorti d'index.html. Script classique, comme les dix autres fichiers du site :
 * les fonctions restent accessibles depuis les autres fichiers sans rien exporter,
 * et ce fichier est charge avant le script principal qui s'en sert.
 */

// ---- Onglet Equipement > Installations sportives ----
var installationsTabReady = false;

function initInstallationsTab() {
  if (!installationsTabReady) {
    document.getElementById("addInstallationBtn").addEventListener("click", createInstallation);
    document.getElementById("equipSubtabs").addEventListener("click", e => {
      const btn = e.target.closest(".subtabbtn");
      if (btn) showEquipTab(btn.dataset.equiptab);
    });
    installationsTabReady = true;
  }
  showEquipTab(equipMode);
}

// ---- Sous-onglets Equipement : installations, materiel, EPI escalade ----
let equipMode = "installations";

function showEquipTab(mode) {
  equipMode = mode;
  ["installations", "materiel", "epi"].forEach(t => {
    document.getElementById("equipTab-" + t).style.display = t === mode ? "block" : "none";
  });
  document.querySelectorAll("#equipSubtabs .subtabbtn").forEach(b =>
    b.classList.toggle("active", b.dataset.equiptab === mode));
  if (mode === "installations") loadInstallationsList();
  if (mode === "materiel") loadEquipment();
  if (mode === "epi") loadEpiItems();
}

// ---- Materiel EPS (miroir de EquipmentHomeScreen.kt / EquipmentDetailScreen.kt) ----
// Suivi en stock initial / actuel / perdu / hors service, avec un seuil d'alerte.

const EQUIPMENT_CATEGORIES = [
  ["BALLONS", "Ballons"], ["RAQUETTES", "Raquettes"], ["VOLANTS", "Volants"],
  ["CHASUBLES", "Chasubles"], ["PLOTS", "Plots"], ["CHRONOMETRES", "Chronometres"],
  ["TAPIS", "Tapis"], ["ATHLETISME", "Materiel athletisme"], ["GYMNASTIQUE", "Materiel gymnastique"],
  ["NATATION", "Materiel natation"], ["ESCALADE", "Materiel escalade"], ["AUTRE", "Autre"]
];

let equipmentList = [];
let equipmentOpenedId = null;

async function loadEquipment() {
  const wrap = document.getElementById("equipTab-materiel");
  wrap.innerHTML = '<div class="card muted">Chargement du materiel...</div>';
  try {
    const res = await apiFetch(`${SUPABASE_URL}/rest/v1/equipment?deleted=eq.false&select=*&order=name.asc`);
    equipmentList = res.ok ? await res.json() : [];
    renderEquipment();
  } catch (e) {
    wrap.innerHTML = `<div class="card"><div class="error">Table indisponible. Executez schema_equipement_programmes.sql dans Supabase.</div></div>`;
  }
}

function equipmentIsLow(item) {
  return item.low_stock_threshold != null && item.quantity_current <= item.low_stock_threshold;
}

function renderEquipment() {
  const wrap = document.getElementById("equipTab-materiel");
  if (equipmentOpenedId) { renderEquipmentDetail(); return; }

  const low = equipmentList.filter(equipmentIsLow);
  const rows = equipmentList.length === 0
    ? '<div class="muted" style="margin-top:12px">Aucun materiel enregistre.</div>'
    : equipmentList.map(item => {
        const cat = (EQUIPMENT_CATEGORIES.find(c => c[0] === item.category) || ["", item.category])[1];
        return `<div class="top" style="padding:8px 0; border-bottom:1px solid var(--border)">
          <div>
            <strong>${item.name}</strong> <span class="badge">${cat}</span>
            ${equipmentIsLow(item) ? '<span class="badge" style="background:#FDEEED; color:var(--danger)">Stock bas</span>' : ""}
            <div class="muted">${item.quantity_current} en service · ${item.quantity_lost} perdus · ${item.quantity_out_of_service} hors service${item.location ? " · " + item.location : ""}</div>
          </div>
          <div style="display:flex; gap:6px">
            <button class="secondary" data-open-equip="${item.id}" style="margin-top:0">Ouvrir</button>
            <button class="danger" data-del-equip="${item.id}" style="margin-top:0">Supprimer</button>
          </div>
        </div>`;
      }).join("");

  wrap.innerHTML = `<div class="card">
    <div class="top">
      <div>
        <h2 style="margin:0">Materiel EPS</h2>
        <div class="muted">Stock initial, en service, perdu et hors service, avec un seuil d'alerte.</div>
      </div>
      <button id="addEquipBtn" style="margin-top:0">+ Materiel</button>
    </div>
    ${low.length ? `<div class="pendingHint" style="display:block; margin-top:10px">${low.length} materiel(s) sous le seuil d'alerte : ${low.map(i => i.name).join(", ")}.</div>` : ""}
    ${rows}
  </div>`;

  document.getElementById("addEquipBtn").onclick = addEquipment;
  wrap.querySelectorAll("[data-open-equip]").forEach(b =>
    b.onclick = () => { equipmentOpenedId = b.dataset.openEquip; renderEquipment(); });
  wrap.querySelectorAll("[data-del-equip]").forEach(b =>
    b.onclick = () => deleteEquipment(b.dataset.delEquip));
}

function renderEquipmentDetail() {
  const wrap = document.getElementById("equipTab-materiel");
  const item = equipmentList.find(x => x.id === equipmentOpenedId);
  if (!item) { equipmentOpenedId = null; renderEquipment(); return; }

  const text = (key, label, type = "text") =>
    `<div><label>${label}</label><input type="${type}" data-equip-field="${key}" value="${(item[key] ?? "").toString().replace(/"/g, "&quot;")}"></div>`;

  wrap.innerHTML = `<div class="card">
    <div class="top">
      <h2 style="margin:0">${item.name}</h2>
      <button class="secondary" id="backEquipBtn" style="margin-top:0">Retour</button>
    </div>
    <div class="row">
      ${text("name", "Nom")}
      <div><label>Categorie</label><select data-equip-field="category">${EQUIPMENT_CATEGORIES.map(([k, l]) =>
        `<option value="${k}"${item.category === k ? " selected" : ""}>${l}</option>`).join("")}</select></div>
    </div>
    <div class="row">${text("brand", "Marque")}${text("reference", "Reference")}</div>
    <div class="row">
      ${text("quantity_initial", "Stock initial", "number")}
      ${text("quantity_current", "En service", "number")}
    </div>
    <div class="row">
      ${text("quantity_lost", "Perdus", "number")}
      ${text("quantity_out_of_service", "Hors service", "number")}
    </div>
    <div class="row">
      ${text("low_stock_threshold", "Seuil d'alerte", "number")}
      ${text("location", "Rangement")}
    </div>
    <div class="row">${text("supplier", "Fournisseur")}${text("comment", "Commentaire")}</div>
    <button id="saveEquipBtn">Enregistrer</button>
    <div class="ok" id="equipOk"></div>
  </div>`;

  document.getElementById("backEquipBtn").onclick = () => { equipmentOpenedId = null; renderEquipment(); };
  document.getElementById("saveEquipBtn").onclick = saveEquipment;
}

async function addEquipment() {
  const id = crypto.randomUUID();
  await apiFetch(`${SUPABASE_URL}/rest/v1/equipment`, {
    method: "POST",
    body: JSON.stringify({
      id, user_id: session.user_id, name: "Nouveau materiel", category: "AUTRE",
      updated_at: new Date().toISOString(), deleted: false
    })
  });
  await loadEquipment();
  equipmentOpenedId = id;
  renderEquipment();
}

async function saveEquipment() {
  const wrap = document.getElementById("equipTab-materiel");
  const numeric = ["quantity_initial", "quantity_current", "quantity_lost", "quantity_out_of_service", "low_stock_threshold"];
  const payload = { updated_at: new Date().toISOString() };
  wrap.querySelectorAll("[data-equip-field]").forEach(el => {
    const key = el.dataset.equipField;
    if (numeric.includes(key)) {
      const n = parseInt(el.value, 10);
      payload[key] = isNaN(n) ? (key === "low_stock_threshold" ? null : 0) : n;
    } else {
      payload[key] = el.value;
    }
  });
  await apiFetch(`${SUPABASE_URL}/rest/v1/equipment?id=eq.${equipmentOpenedId}`, {
    method: "PATCH", body: JSON.stringify(payload)
  });
  Object.assign(equipmentList.find(x => x.id === equipmentOpenedId), payload);
  document.getElementById("equipOk").textContent = "Materiel enregistre.";
}

async function deleteEquipment(id) {
  await apiFetch(`${SUPABASE_URL}/rest/v1/equipment?id=eq.${id}`, {
    method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: new Date().toISOString() })
  });
  await loadEquipment();
}

// ---- EPI escalade (miroir de EpiHomeScreen / EpiDetailScreen / EpiInspectionScreen) ----
// La securite des eleves en depend : les inspections ne sont jamais supprimees, elles
// constituent le registre de vie de chaque equipement.

const EPI_CATEGORIES = [
  ["BAUDRIER", "Baudrier"], ["CORDE", "Corde"], ["LONGE", "Longe"], ["MOUSQUETON", "Mousqueton"],
  ["DEGAINE", "Degaine"], ["CASQUE", "Casque"], ["SYSTEME_ASSURAGE", "Systeme d'assurage"],
  ["SANGLE", "Sangle"], ["ANNEAU", "Anneau"], ["AUTRE", "Autre"]
];
const EPI_STATUSES = [
  ["EN_SERVICE", "En service", "#E5F7E9"], ["A_CONTROLER", "A controler", "#FFF0DD"],
  ["QUARANTAINE", "Mis en quarantaine", "#FFE8EE"], ["REFORME", "Reforme / mis au rebut", "#F3F4F6"]
];
const EPI_RESULTS = [
  ["CONFORME", "Conforme"], ["A_SURVEILLER", "A surveiller"],
  ["QUARANTAINE", "Quarantaine"], ["REFORME", "Reforme"]
];

let epiList = [];
let epiOpenedId = null;
let epiInspections = [];

async function loadEpiItems() {
  const wrap = document.getElementById("equipTab-epi");
  wrap.innerHTML = '<div class="card muted">Chargement des EPI...</div>';
  try {
    const res = await apiFetch(`${SUPABASE_URL}/rest/v1/epi_items?deleted=eq.false&select=*&order=internal_id.asc`);
    epiList = res.ok ? await res.json() : [];
    renderEpi();
  } catch (e) {
    wrap.innerHTML = `<div class="card"><div class="error">Table indisponible. Executez schema_equipement_programmes.sql dans Supabase.</div></div>`;
  }
}

function epiDate(millis) {
  return millis ? new Date(Number(millis)).toLocaleDateString("fr-FR") : "—";
}

/** Alerte si le controle est du, ou si l'EPI a depasse sa date de fin de vie. */
function epiAlert(item) {
  const now = Date.now();
  if (item.status === "QUARANTAINE" || item.status === "REFORME") return null;
  if (item.end_of_life_date_epoch_millis && Number(item.end_of_life_date_epoch_millis) <= now) return "Fin de vie atteinte";
  if (item.next_inspection_date_epoch_millis && Number(item.next_inspection_date_epoch_millis) <= now) return "Controle a faire";
  return null;
}

function renderEpi() {
  const wrap = document.getElementById("equipTab-epi");
  if (epiOpenedId) { renderEpiDetail(); return; }

  const alerts = epiList.map(i => [i, epiAlert(i)]).filter(([, a]) => a);
  const rows = epiList.length === 0
    ? '<div class="muted" style="margin-top:12px">Aucun EPI enregistre.</div>'
    : epiList.map(item => {
        const cat = (EPI_CATEGORIES.find(c => c[0] === item.category) || ["", item.category])[1];
        const st = EPI_STATUSES.find(s => s[0] === item.status) || EPI_STATUSES[0];
        const alert = epiAlert(item);
        return `<div class="top" style="padding:8px 0; border-bottom:1px solid var(--border)">
          <div>
            <strong>${item.internal_id || "Sans identifiant"}</strong> <span class="badge">${cat}</span>
            <span class="badge" style="background:${st[2]}">${st[1]}</span>
            ${alert ? `<span class="badge" style="background:#FDEEED; color:var(--danger)">${alert}</span>` : ""}
            <div class="muted">${[item.manufacturer, item.model].filter(Boolean).join(" ") || "Modele non renseigne"} · prochain controle ${epiDate(item.next_inspection_date_epoch_millis)}</div>
          </div>
          <button class="secondary" data-open-epi="${item.id}" style="margin-top:0">Fiche de vie</button>
        </div>`;
      }).join("");

  wrap.innerHTML = `<div class="card">
    <div class="top">
      <div>
        <h2 style="margin:0">EPI escalade</h2>
        <div class="muted">Fiche de vie de chaque equipement de protection : identification, dates, statut et registre des controles.</div>
      </div>
      <button id="addEpiBtn" style="margin-top:0">+ EPI</button>
    </div>
    ${alerts.length ? `<div class="pendingHint" style="display:block; margin-top:10px">${alerts.length} EPI a traiter : ${alerts.map(([i, a]) => `${i.internal_id} (${a})`).join(", ")}.</div>` : ""}
    ${rows}
  </div>`;

  document.getElementById("addEpiBtn").onclick = addEpiItem;
  wrap.querySelectorAll("[data-open-epi]").forEach(b =>
    b.onclick = () => { epiOpenedId = b.dataset.openEpi; renderEpi(); });
}

async function renderEpiDetail() {
  const wrap = document.getElementById("equipTab-epi");
  const item = epiList.find(x => x.id === epiOpenedId);
  if (!item) { epiOpenedId = null; renderEpi(); return; }

  const res = await apiFetch(`${SUPABASE_URL}/rest/v1/epi_inspections?epi_id=eq.${item.id}&select=*&order=date_epoch_millis.desc`);
  epiInspections = res.ok ? await res.json() : [];

  const text = (key, label, type = "text") =>
    `<div><label>${label}</label><input type="${type}" data-epi-field="${key}" value="${(item[key] ?? "").toString().replace(/"/g, "&quot;")}"></div>`;
  const dateField = (key, label) =>
    `<div><label>${label}</label><input type="date" data-epi-date="${key}" value="${item[key] ? new Date(Number(item[key])).toISOString().slice(0, 10) : ""}"></div>`;

  const history = epiInspections.length === 0
    ? '<div class="muted">Aucun controle enregistre.</div>'
    : epiInspections.map(i => {
        const r = (EPI_RESULTS.find(x => x[0] === i.result) || ["", i.result])[1];
        return `<div class="top" style="padding:7px 0; border-bottom:1px solid var(--border)">
          <div>${epiDate(i.date_epoch_millis)} · <strong>${r}</strong>
            <div class="muted">${i.inspector || "Controleur non precise"}${i.observations ? " — " + i.observations : ""}</div>
          </div>
        </div>`;
      }).join("");

  wrap.innerHTML = `<div class="card">
    <div class="top">
      <h2 style="margin:0">${item.internal_id || "EPI"}</h2>
      <button class="secondary" id="backEpiBtn" style="margin-top:0">Retour</button>
    </div>
    <div class="row">
      ${text("internal_id", "Identifiant interne")}
      <div><label>Categorie</label><select data-epi-field="category">${EPI_CATEGORIES.map(([k, l]) =>
        `<option value="${k}"${item.category === k ? " selected" : ""}>${l}</option>`).join("")}</select></div>
    </div>
    <div class="row">${text("manufacturer", "Fabricant")}${text("model", "Modele")}</div>
    <div class="row">${text("serial_number", "Numero de serie")}${text("lot_number", "Numero de lot")}</div>
    <div class="row">${text("color", "Couleur")}${text("location", "Rangement")}</div>
    <div class="row">${dateField("manufacture_date_epoch_millis", "Fabrication")}${dateField("purchase_date_epoch_millis", "Achat")}</div>
    <div class="row">${dateField("first_use_date_epoch_millis", "Premiere utilisation")}${dateField("end_of_life_date_epoch_millis", "Fin de vie")}</div>
    <div class="row">${dateField("next_inspection_date_epoch_millis", "Prochain controle")}
      <div><label>Statut</label><select data-epi-field="status">${EPI_STATUSES.map(([k, l]) =>
        `<option value="${k}"${item.status === k ? " selected" : ""}>${l}</option>`).join("")}</select></div>
    </div>
    <div class="row">${text("comment", "Commentaire")}</div>
    <button id="saveEpiBtn">Enregistrer la fiche</button>
    <div class="ok" id="epiOk"></div>

    <h2 style="margin:20px 0 6px; font-size:15px">Registre des controles</h2>
    <div class="muted" style="margin-bottom:8px">Les controles ne sont jamais supprimes : ils constituent le registre de vie de l'equipement.</div>
    ${history}

    <h2 style="margin:18px 0 0; font-size:15px">Nouveau controle</h2>
    <div class="row">
      <div><label for="inspDate">Date</label><input type="date" id="inspDate" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div><label for="inspResult">Resultat</label><select id="inspResult">${EPI_RESULTS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
    </div>
    <div class="row">
      <div><label for="inspBy">Controleur</label><input type="text" id="inspBy" value="${session.email || ""}"></div>
      <div><label for="inspNotes">Observations</label><input type="text" id="inspNotes"></div>
    </div>
    <button id="addInspBtn">Enregistrer le controle</button>
    <div class="error" id="inspError"></div>
  </div>`;

  document.getElementById("backEpiBtn").onclick = () => { epiOpenedId = null; renderEpi(); };
  document.getElementById("saveEpiBtn").onclick = saveEpiItem;
  document.getElementById("addInspBtn").onclick = addEpiInspection;
}

async function addEpiItem() {
  const id = crypto.randomUUID();
  await apiFetch(`${SUPABASE_URL}/rest/v1/epi_items`, {
    method: "POST",
    body: JSON.stringify({
      id, user_id: session.user_id, internal_id: "EPI-" + id.slice(0, 4).toUpperCase(),
      category: "AUTRE", status: "EN_SERVICE", qr_code_value: id,
      updated_at: new Date().toISOString(), deleted: false
    })
  });
  await loadEpiItems();
  epiOpenedId = id;
  renderEpi();
}

async function saveEpiItem() {
  const wrap = document.getElementById("equipTab-epi");
  const payload = { updated_at: new Date().toISOString() };
  wrap.querySelectorAll("[data-epi-field]").forEach(el => { payload[el.dataset.epiField] = el.value; });
  wrap.querySelectorAll("[data-epi-date]").forEach(el => {
    payload[el.dataset.epiDate] = el.value ? new Date(el.value).getTime() : null;
  });
  await apiFetch(`${SUPABASE_URL}/rest/v1/epi_items?id=eq.${epiOpenedId}`, {
    method: "PATCH", body: JSON.stringify(payload)
  });
  Object.assign(epiList.find(x => x.id === epiOpenedId), payload);
  document.getElementById("epiOk").textContent = "Fiche enregistree.";
  renderEpi();
}

/**
 * Un controle met a jour le statut de l'EPI : quarantaine et reforme sortent l'equipement
 * du service, c'est la raison d'etre du registre.
 */
async function addEpiInspection() {
  const errorEl = document.getElementById("inspError");
  errorEl.textContent = "";
  const date = document.getElementById("inspDate").value;
  if (!date) { errorEl.textContent = "Indiquez la date du controle."; return; }
  const result = document.getElementById("inspResult").value;
  try {
    await apiFetch(`${SUPABASE_URL}/rest/v1/epi_inspections`, {
      method: "POST",
      body: JSON.stringify({
        id: crypto.randomUUID(), user_id: session.user_id, epi_id: epiOpenedId,
        date_epoch_millis: new Date(date).getTime(),
        inspector: document.getElementById("inspBy").value,
        result, observations: document.getElementById("inspNotes").value,
        updated_at: new Date().toISOString(), deleted: false
      })
    });
    const status = result === "QUARANTAINE" ? "QUARANTAINE"
                 : result === "REFORME" ? "REFORME"
                 : result === "A_SURVEILLER" ? "A_CONTROLER" : "EN_SERVICE";
    const patch = { status, last_inspection_date_epoch_millis: new Date(date).getTime(), updated_at: new Date().toISOString() };
    await apiFetch(`${SUPABASE_URL}/rest/v1/epi_items?id=eq.${epiOpenedId}`, {
      method: "PATCH", body: JSON.stringify(patch)
    });
    Object.assign(epiList.find(x => x.id === epiOpenedId), patch);
    renderEpiDetail();
  } catch (e) {
    errorEl.textContent = e.message;
  }
}

/**
 * Demarre le mode hors connexion (la partie "application installable" du site).
 *
 * Charge a la demande, et jamais bloquant : une panne de ce cote ne doit pas empecher
 * d'utiliser le site. D'ou le catch silencieux - chaque rubrique raccordee sait retomber sur
 * son fonctionnement d'avant, en direct avec Supabase.
 */
let modeHorsConnexion = null;
async function demarrerModeHorsConnexion() {
  if (modeHorsConnexion) return modeHorsConnexion;
  try {
    const module = await import("./pwa/bootstrap.js");
    modeHorsConnexion = await module.demarrerHorsConnexion({
      url: SUPABASE_URL,
      anonKey: SUPABASE_KEY,
      // Relue a chaque appel : une bascule de compte ne doit pas figer le moteur sur l'ancien.
      session: () => session,
      statusElement: document.getElementById("syncStatus"),
      conflictElement: document.getElementById("conflictPanel"),
      // Miroir des regles de la base : ce qui sera refuse n'entre pas dans la file d'attente.
      droits: droitEcriture,
      // Une seule table pour commencer. Le reste du site continue de parler a Supabase en
      // direct : on n'expose pas toutes les rubriques au premier essai.
      tables: ["sport_installations"]
    });
    modeHorsConnexion?.surEtat(detail => {
      if (detail.state === "synced" && currentWebTab === "equipement") loadInstallationsList();
    });
  } catch (e) {
    console.warn("Mode hors connexion indisponible :", e.message);
    modeHorsConnexion = null;
  }
  return modeHorsConnexion;
}

async function createInstallation() {
  const input = document.getElementById("installationName");
  const errorEl = document.getElementById("installationError");
  errorEl.textContent = "";
  const name = input.value.trim();
  if (!name) { errorEl.textContent = "Donnez un nom a l'installation."; return; }
  const ligne = { id: crypto.randomUUID(), user_id: session.user_id, name, updated_at: new Date().toISOString(), deleted: false };
  if (modeHorsConnexion) {
    // Retenue localement d'abord : sans reseau elle attend dans la file au lieu d'etre perdue.
    // Sauf si ce compte n'a pas le droit de la creer : autant le dire maintenant.
    try { await modeHorsConnexion.enregistrer("sport_installations", ligne.id, ligne); }
    catch (e) { errorEl.textContent = e.message; return; }
  } else {
    await apiFetch(`${SUPABASE_URL}/rest/v1/sport_installations`, { method: "POST", body: JSON.stringify(ligne) });
  }
  input.value = "";
  await loadInstallationsList();
  await loadPlanningInstallations();
}

async function deleteInstallation(id) {
  const errorEl = document.getElementById("installationError");
  if (errorEl) errorEl.textContent = "";
  if (modeHorsConnexion) {
    // Le refus arrive avant toute mise en file : il doit se lire tout de suite, la ou le
    // professeur vient de cliquer.
    try { await modeHorsConnexion.supprimer("sport_installations", id); }
    catch (e) { if (errorEl) errorEl.textContent = e.message; return; }
  } else {
    await apiFetch(`${SUPABASE_URL}/rest/v1/sport_installations?id=eq.${id}`, {
      method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: new Date().toISOString() })
    });
  }
  await loadInstallationsList();
  await loadPlanningInstallations();
}

async function loadInstallationsList() {
  const listEl = document.getElementById("installationsList");
  listEl.innerHTML = '<div class="muted">Chargement...</div>';
  let rows;
  if (modeHorsConnexion) {
    // La copie locale fait foi a l'affichage, meme connecte : une installation ajoutee hors
    // reseau doit rester visible jusqu'a son envoi, sinon elle semble avoir disparu.
    const lecture = await modeHorsConnexion.lire("sport_installations");
    rows = lecture.rows.filter(r => !r.deleted).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } else {
    const res = await apiFetch(`${SUPABASE_URL}/rest/v1/sport_installations?deleted=eq.false&select=*&order=name.asc`);
    rows = res.ok ? await res.json() : [];
  }
  if (rows.length === 0) {
    listEl.innerHTML = '<div class="muted">Aucune installation pour le moment.</div>';
    return;
  }
  listEl.innerHTML = "";
  rows.forEach(r => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<div class="top"><div>${r.name}</div><button class="danger" data-action="delete" style="margin-top:0">Supprimer</button></div>`;
    div.querySelector('[data-action="delete"]').addEventListener("click", () => deleteInstallation(r.id));
    listEl.appendChild(div);
  });
}
