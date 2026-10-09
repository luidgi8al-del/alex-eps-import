/*
 * Onglet EQUIPEMENT : installations sportives, materiel EPS et EPI escalade.
 *
 * Sorti d'index.html. Script classique, comme les dix autres fichiers du site :
 * les fonctions restent accessibles depuis les autres fichiers sans rien exporter,
 * et ce fichier est charge avant le script principal qui s'en sert.
 */

// ---- Onglet Equipement > Installations sportives ----
var installationsTabReady = false;
var installationsCache = [];
var installationOverviewIncidents = [];
var installationOverviewFilter = "all";

function showInstallationView(view) {
  document.getElementById("installationOverview").hidden = view !== "overview";
  document.getElementById("installationFollowView").hidden = view !== "follow";
  if (view === "overview") loadInstallationIncidentsOverview();
  if (view === "follow") loadInstallationsList();
}

function initInstallationsTab() {
  if (!installationsTabReady) {
    document.getElementById("addInstallationBtn").addEventListener("click", createInstallation);
    document.getElementById("installationQuickReportBtn").addEventListener("click", openInstallationReportPicker);
    document.getElementById("installationShowFollowBtn").addEventListener("click", () => showInstallationView("follow"));
    document.getElementById("installationBackOverviewBtn").addEventListener("click", () => showEquipTab("installations"));
    document.querySelectorAll("[data-installation-filter]").forEach(button => button.addEventListener("click", () => {
      installationOverviewFilter = button.dataset.installationFilter;
      renderInstallationIncidentsOverview();
    }));
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
  if (mode === "installations") {
    showInstallationView("overview");
  }
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
    equipmentList = await lireTable("equipment", "equipment?deleted=eq.false&select=*&order=name.asc",
      { trier: (a, b) => String(a.name || "").localeCompare(String(b.name || "")) });
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
  await enregistrerLigne("equipment", {
    id, user_id: session.user_id, name: "Nouveau materiel", category: "AUTRE",
    updated_at: new Date().toISOString(), deleted: false
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
  // La file d'attente porte des lignes entieres, pas des retouches : on part de la ligne connue
  // et on applique la saisie dessus, sinon un envoi differe effacerait les champs absents.
  const actuel = equipmentList.find(x => x.id === equipmentOpenedId) || { id: equipmentOpenedId };
  await enregistrerLigne("equipment", { ...actuel, ...payload });
  Object.assign(actuel, payload);
  document.getElementById("equipOk").textContent = "Materiel enregistre.";
}

async function deleteEquipment(id) {
  await supprimerLigne("equipment", id);
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
let epiSearch = "";

function epiPrefix(category) {
  return ({ BAUDRIER:"BAU", CORDE:"COR", LONGE:"LON", MOUSQUETON:"MOU", DEGAINE:"DEG",
    CASQUE:"CAS", SYSTEME_ASSURAGE:"ASS", SANGLE:"SAN", ANNEAU:"ANN", AUTRE:"EPI" })[category] || "EPI";
}

function nextEpiReference(category) {
  const prefix = epiPrefix(category);
  const max = epiList.reduce((n, item) => {
    const match = String(item.internal_id || "").toUpperCase().match(new RegExp(`^${prefix}-(\\d+)$`));
    return match ? Math.max(n, Number(match[1])) : n;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

async function loadEpiItems() {
  const wrap = document.getElementById("equipTab-epi");
  wrap.innerHTML = '<div class="card muted">Chargement des EPI...</div>';
  try {
    epiList = await lireTable("epi_items",
      "epi_items?deleted=eq.false&select=*&order=internal_id.asc",
      { trier: (a, b) => String(a.internal_id || "").localeCompare(String(b.internal_id || "")) });
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
  const visible = epiList.filter(item => !epiSearch || [item.internal_id, item.category, item.manufacturer, item.model, item.location]
    .some(value => String(value || "").toLowerCase().includes(epiSearch.toLowerCase())));
  const rows = visible.length === 0
    ? '<div class="muted" style="margin-top:12px">Aucun EPI enregistre.</div>'
    : visible.map(item => {
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
    <div class="row" style="margin-top:12px"><div><label for="epiSearchInput">Rechercher</label><input id="epiSearchInput" value="${epiSearch.replace(/"/g,"&quot;")}" placeholder="Numero, categorie, modele ou rangement"></div></div>
    ${rows}
  </div>`;

  document.getElementById("addEpiBtn").onclick = addEpiItem;
  document.getElementById("epiSearchInput").oninput = event => { epiSearch = event.target.value; renderEpi(); const input=document.getElementById("epiSearchInput"); input?.focus(); input?.setSelectionRange(epiSearch.length,epiSearch.length); };
  wrap.querySelectorAll("[data-open-epi]").forEach(b =>
    b.onclick = () => { epiOpenedId = b.dataset.openEpi; renderEpi(); });
}

async function renderEpiDetail() {
  const wrap = document.getElementById("equipTab-epi");
  const item = epiList.find(x => x.id === epiOpenedId);
  if (!item) { epiOpenedId = null; renderEpi(); return; }

  epiInspections = await lireTable("epi_inspections",
    `epi_inspections?epi_id=eq.${item.id}&select=*&order=date_epoch_millis.desc`,
    { ou: i => i.epi_id === item.id,
      trier: (a, b) => Number(b.date_epoch_millis || 0) - Number(a.date_epoch_millis || 0) });

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
    <div class="card" style="text-align:center;background:#f5faff">
      <div id="epiQrCanvas" style="display:flex;justify-content:center;margin:8px"></div>
      <div style="font-size:28px;font-weight:900;color:#123a59">${item.internal_id || "EPI"}</div>
      <div class="muted">Scannez pour ouvrir la fiche et son historique</div>
      <div class="row"><button id="printEpiLabelBtn">Imprimer l'etiquette</button><button class="secondary" id="saveEpiLabelBtn">Enregistrer l'etiquette</button></div>
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
  renderEpiQr(item);
}

async function addEpiItem() {
  const wrap = document.getElementById("equipTab-epi");
  wrap.innerHTML = `<div class="card" style="max-width:680px;margin:auto"><div class="top"><div><h2 style="margin:0">Nouvel EPI</h2><div class="muted">La reference et le QR code seront lies a la meme fiche.</div></div><button class="secondary" id="cancelNewEpi">Annuler</button></div><div class="row"><div><label>Categorie</label><select id="newEpiCategory">${EPI_CATEGORIES.map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}</select></div><div><label>Reference unique</label><input id="newEpiReference"></div></div><button id="confirmNewEpi">Creer la fiche et le QR code</button></div>`;
  const category=document.getElementById("newEpiCategory"),reference=document.getElementById("newEpiReference");
  const suggest=()=>reference.value=nextEpiReference(category.value);suggest();category.onchange=suggest;
  document.getElementById("cancelNewEpi").onclick=renderEpi;
  document.getElementById("confirmNewEpi").onclick=async()=>{
    const internalId=reference.value.trim().toUpperCase();if(!internalId)return;
    if(epiList.some(x=>String(x.internal_id).toUpperCase()===internalId))return alert("Cette reference existe deja.");
  const id = crypto.randomUUID();
  await enregistrerLigne("epi_items", {
    id, user_id: session.user_id, internal_id: internalId,
    category: category.value, status: "EN_SERVICE", qr_code_value: internalId,
    updated_at: new Date().toISOString(), deleted: false
  });
  await loadEpiItems();
  epiOpenedId = id;
  renderEpi();
  };
}

function renderEpiQr(item) {
  const host=document.getElementById("epiQrCanvas"),value=item.qr_code_value||item.internal_id;
  if(!host)return;
  if(typeof QRCode!=="function"){host.innerHTML='<div class="error">Generateur QR indisponible hors connexion.</div>';return;}
  new QRCode(host,{text:value,width:190,height:190,colorDark:"#000000",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M});
  const openLabel=print=>{const canvas=host.querySelector("canvas"),img=host.querySelector("img"),src=canvas?.toDataURL("image/png")||img?.src;if(!src)return;const w=open("","_blank");w.document.write(`<html><head><title>Etiquette ${item.internal_id}</title><style>@page{size:A4;margin:15mm}body{font-family:Arial;text-align:center;color:#123a59}.label{width:90mm;border:3px solid #123a59;border-radius:18px;padding:0 0 18px;margin:auto;overflow:hidden}.head{background:#087dca;color:white;padding:18px;font-size:20px;font-weight:800}.ref{font-size:34px;font-weight:900}.cat{font-size:18px}img{width:58mm;height:58mm}</style></head><body><div class="label"><div class="head">EPS · LYCEE VICTOR HUGO</div><img src="${src}"><div class="ref">${item.internal_id}</div><div class="cat">${(EPI_CATEGORIES.find(x=>x[0]===item.category)||[0,item.category])[1]}</div></div><script>${print?'onload=()=>print()':''}<\/script></body></html>`);w.document.close()};
  document.getElementById("printEpiLabelBtn").onclick=()=>openLabel(true);
  document.getElementById("saveEpiLabelBtn").onclick=()=>openLabel(false);
}

async function saveEpiItem() {
  const wrap = document.getElementById("equipTab-epi");
  const payload = { updated_at: new Date().toISOString() };
  wrap.querySelectorAll("[data-epi-field]").forEach(el => { payload[el.dataset.epiField] = el.value; });
  wrap.querySelectorAll("[data-epi-date]").forEach(el => {
    payload[el.dataset.epiDate] = el.value ? new Date(el.value).getTime() : null;
  });
  // Ligne entiere et non retouche : voir saveEquipment, meme raison.
  const actuel = epiList.find(x => x.id === epiOpenedId) || { id: epiOpenedId };
  await enregistrerLigne("epi_items", { ...actuel, ...payload });
  Object.assign(actuel, payload);
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
    await enregistrerLigne("epi_inspections", {
      id: crypto.randomUUID(), user_id: session.user_id, epi_id: epiOpenedId,
      date_epoch_millis: new Date(date).getTime(),
      inspector: document.getElementById("inspBy").value,
      result, observations: document.getElementById("inspNotes").value,
      updated_at: new Date().toISOString(), deleted: false
    });
    const status = result === "QUARANTAINE" ? "QUARANTAINE"
                 : result === "REFORME" ? "REFORME"
                 : result === "A_SURVEILLER" ? "A_CONTROLER" : "EN_SERVICE";
    const patch = { status, last_inspection_date_epoch_millis: new Date(date).getTime(), updated_at: new Date().toISOString() };
    const fiche = epiList.find(x => x.id === epiOpenedId) || { id: epiOpenedId };
    await enregistrerLigne("epi_items", { ...fiche, ...patch });
    Object.assign(fiche, patch);
    renderEpiDetail();
  } catch (e) {
    errorEl.textContent = e.message;
  }
}

async function createInstallation() {
  const input = document.getElementById("installationName");
  const errorEl = document.getElementById("installationError");
  errorEl.textContent = "";
  const name = input.value.trim();
  if (!name) { errorEl.textContent = "Donnez un nom a l'installation."; return; }
  const ligne = { id: crypto.randomUUID(), user_id: session.user_id, name,
    updated_at: new Date().toISOString(), deleted: false };
  if (modeHorsConnexion) {
    // Retenue localement d'abord : sans reseau elle attend dans la file au lieu d'etre perdue.
    // Sauf si ce compte n'a pas le droit de la creer : autant le dire maintenant.
    try { await modeHorsConnexion.enregistrer("sport_installations", ligne.id, ligne); }
    catch (e) { errorEl.textContent = e.message; return; }
  } else {
    await enregistrerLigne("sport_installations", ligne);
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
    await supprimerLigne("sport_installations", id);
  }
  await loadInstallationsList();
  await loadPlanningInstallations();
}

function renderInstallationIncidentsOverview() {
  const host = document.getElementById("installationIncidentsOverview");
  document.getElementById("installationCountPending").textContent = installationOverviewIncidents.filter(row => row.status === "SIGNALE").length;
  document.getElementById("installationCountProgress").textContent = installationOverviewIncidents.filter(row => row.status === "EN_COURS").length;
  document.getElementById("installationCountResolved").textContent = installationOverviewIncidents.filter(row => row.status === "RESOLU").length;
  document.querySelectorAll("[data-installation-filter]").forEach(button => {
    const active = button.dataset.installationFilter === installationOverviewFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const visible = installationOverviewIncidents.filter(row => installationOverviewFilter !== "urgent" || row.urgency === "URGENT");
  if (!visible.length) {
    host.innerHTML = `<div class="muted installation-overview-empty">${installationOverviewFilter === "urgent" ? "Aucun signalement urgent." : "Aucun signalement pour le moment."}</div>`;
    return;
  }
  host.innerHTML = visible.map(row => {
    const type = INSTALLATION_INCIDENT_TYPES[row.incident_type] || "Installation";
    const description = String(row.description || "").trim();
    const title = description.length > 80 ? description.slice(0, 79) + "…" : description || type;
    const when = row.reported_at && !Number.isNaN(new Date(row.reported_at).getTime())
      ? new Date(row.reported_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "Date non renseignée";
    const label = row.status === "A_ENVOYER" ? "À envoyer"
      : row.status === "SIGNALE" ? "À traiter"
      : row.status === "EN_COURS" ? "Pris en charge" : "Résolu";
    return `<article class="installation-overview-card">
      <div class="installation-overview-card-head"><strong>${planningText(title)}</strong><span class="installation-urgency ${row.urgency === "URGENT" ? "urgent" : "normal"}">${row.urgency === "URGENT" ? "Urgent" : "Normal"}</span></div>
      <p>${planningText(row.installation_name || "Installation")} · ${label}<br>${planningText(when)}</p>
      <button type="button" class="secondary" data-installation-incident="${planningText(row.id)}">Voir le suivi</button>
    </article>`;
  }).join("");
  host.querySelectorAll("[data-installation-incident]").forEach(button => button.addEventListener("click", () => {
    const incident = installationOverviewIncidents.find(row => row.id === button.dataset.installationIncident);
    if (incident) openInstallationHistory({ id: incident.installation_id, name: incident.installation_name });
  }));
}

async function loadInstallationIncidentsOverview() {
  const host = document.getElementById("installationIncidentsOverview");
  host.innerHTML = '<div class="muted installation-overview-empty">Chargement des signalements…</div>';
  try {
    installationOverviewIncidents = await readSharedInstallationIncidents(
      "sport_installation_incidents?deleted=eq.false&select=*&order=reported_at.desc",
      { ou: row => !row.deleted, trier: (a, b) => String(b.reported_at || "").localeCompare(String(a.reported_at || "")) });
    renderInstallationIncidentsOverview();
  } catch (error) {
    host.innerHTML = `<div class="error">Impossible de charger les signalements : ${planningText(error.message || String(error))}</div>`;
  }
}

async function readSharedInstallationIncidents(path, options) {
  // Une ancienne copie hors connexion peut ne contenir que les signalements de ce professeur.
  // En ligne, la lecture serveur fait foi dès que les droits communs sont installés.
  if (navigator.onLine) {
    const response = await apiFetch(`${SUPABASE_URL}/rest/v1/${path}`);
    return response.json();
  }
  return lireTable("sport_installation_incidents", path, options);
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
    rows = await lireTable("sport_installations", "sport_installations?deleted=eq.false&select=*&order=name.asc");
  }
  installationsCache = rows;
  if (rows.length === 0) {
    listEl.innerHTML = '<div class="muted">Aucune installation pour le moment.</div>';
    return;
  }
  listEl.innerHTML = "";
  rows.forEach(r => {
    const div = document.createElement("div");
    div.className = "installation-card";
    div.innerHTML = `<div><strong>${planningText(r.name)}</strong><small>Signalements et suivi des interventions</small></div>
      <div class="installation-card-actions">
        <button type="button" class="secondary" data-action="history">Suivi</button>
      </div>`;
    div.querySelector('[data-action="history"]').addEventListener("click", () => openInstallationHistory(r));
    listEl.appendChild(div);
  });
}

async function openInstallationReportPicker() {
  try {
    await loadInstallationsList();
    const options = installationsCache.map(installation =>
      `<option value="${planningText(installation.id)}">${planningText(installation.name)}</option>`).join("");
    const overlay = installationDialog("Signaler un problème", "", installationsCache.length
      ? `<div class="installation-form"><label>Installation<select id="installationReportChoice"><option value="">Choisir une installation</option>${options}</select></label><div class="error" id="installationReportChoiceError"></div><div class="installation-dialog-actions"><button type="button" class="secondary" data-installation-close-2>Annuler</button><button type="button" id="installationReportContinue">Continuer</button></div></div>`
      : `<div class="installation-form"><p>Ajoutez d'abord une installation pour pouvoir signaler un problème.</p><div class="installation-dialog-actions"><button type="button" class="secondary" data-installation-close-2>Fermer</button></div></div>`);
    overlay.querySelector("[data-installation-close-2]").addEventListener("click", closeInstallationDialog);
    overlay.querySelector("#installationReportContinue")?.addEventListener("click", () => {
      const selected = installationsCache.find(row => row.id === overlay.querySelector("#installationReportChoice").value);
      if (!selected) { overlay.querySelector("#installationReportChoiceError").textContent = "Choisissez une installation."; return; }
      openInstallationReport(selected);
    });
  } catch (error) {
    installationDialog("Signalement indisponible", "", `<p class="error">${planningText(error.message || String(error))}</p>`);
  }
}

async function installationDeliveryReady() {
  const cacheKey = `eps:installation-delivery-ready:${session?.user_id || ""}`;
  if (!navigator.onLine) return localStorage.getItem(cacheKey) === "true";
  const response = await apiFetch(`${SUPABASE_URL}/rest/v1/rpc/eps_installation_delivery_ready`,
    { method: "POST", body: "{}" });
  const ready = await response.json() === true;
  localStorage.setItem(cacheKey, String(ready));
  return ready;
}

function closeInstallationDialog() {
  document.getElementById("installationDialogOverlay")?.remove();
}

function installationDialog(title, subtitle, content) {
  closeInstallationDialog();
  const overlay = document.createElement("div");
  overlay.id = "installationDialogOverlay";
  overlay.className = "installation-dialog-overlay";
  overlay.innerHTML = `<section class="installation-dialog" role="dialog" aria-modal="true" aria-labelledby="installationDialogTitle">
    <header><div><small>INSTALLATIONS SPORTIVES</small><h2 id="installationDialogTitle">${planningText(title)}</h2>${subtitle ? `<p>${planningText(subtitle)}</p>` : ""}</div>
      <button type="button" class="secondary" data-installation-close aria-label="Fermer">✕</button></header>
    <main>${content}</main>
  </section>`;
  overlay.querySelector("[data-installation-close]").addEventListener("click", closeInstallationDialog);
  overlay.addEventListener("click", e => { if (e.target === overlay) closeInstallationDialog(); });
  document.body.appendChild(overlay);
  return overlay;
}

function openInstallationEdit(installation) {
  const overlay = installationDialog("Renommer l'installation", installation.name, `<div class="installation-form">
    <label>Nouveau nom<input id="installationEditName" value="${planningText(installation.name)}"></label>
    <div class="error" id="installationEditError"></div>
    <div class="installation-dialog-actions"><button type="button" class="secondary" data-installation-close-2>Annuler</button><button type="button" id="installationEditSave">Enregistrer</button></div>
  </div>`);
  overlay.querySelector("[data-installation-close-2]").addEventListener("click", closeInstallationDialog);
  overlay.querySelector("#installationEditSave").addEventListener("click", async () => {
    const name = overlay.querySelector("#installationEditName").value.trim();
    if (!name) { overlay.querySelector("#installationEditError").textContent = "Indiquez un nom."; return; }
    try {
      await enregistrerLigne("sport_installations", { ...installation, name, updated_at: new Date().toISOString() });
      closeInstallationDialog();
      await loadInstallationsList();
      await loadPlanningInstallations();
    } catch (e) { overlay.querySelector("#installationEditError").textContent = e.message; }
  });
}

const INSTALLATION_INCIDENT_TYPES = {
  EAU: "Eau", ECLAIRAGE: "Éclairage", CHAUFFAGE: "Chauffage",
  EQUIPEMENT: "Équipement", HYGIENE: "Hygiène", SECURITE: "Sécurité",
  ACCES: "Accès", AUTRE: "Autre problème"
};

const INSTALLATION_STATUS_LABELS = {
  A_ENVOYER: "À envoyer", SIGNALE: "Signalé", EN_COURS: "Intervention en cours", RESOLU: "Résolu"
};

function installationTeacherSignature() {
  const prefs = typeof loadPrefs === "function" ? loadPrefs() : {};
  return String(prefs.teacherName || session?.email?.split("@")[0] || "").trim();
}

async function enregistrerIncidentInstallation(installation, type, description, urgency, photo = '') {
  const now = new Date().toISOString();
  const incident = {
    id: crypto.randomUUID(), user_id: session.user_id, installation_id: installation.id,
    installation_name: installation.name, incident_type: type, description, urgency,
    status: "SIGNALE", message_text: description, whatsapp_phone: "",
    reported_by: installationTeacherSignature(), reported_at: now,
    sent_at: null, resolved_at: null, updated_at: now, deleted: false
  };
  if (photo) {
    if (!InstallationPhoto.valid(photo)) throw new Error('Photo invalide.');
    const key=`eps-installation-photo-ready:${session.user_id}`;
    if(navigator.onLine) {
      const response=await apiFetch(`${SUPABASE_URL}/rest/v1/sport_installation_incidents?select=photo_data&limit=0`);
      if(!response.ok) throw new Error('Les photos nécessitent la mise à jour Supabase des équipements. Votre formulaire est conservé.');
      sessionStorage.setItem(key,'1');
    } else if(sessionStorage.getItem(key)!=='1') throw new Error('Connectez-vous une première fois pour vérifier que les photos sont activées. Votre formulaire est conservé.');
    incident.photo_data=photo;
  }
  await enregistrerLigne("sport_installation_incidents", incident);
  if (!document.getElementById("installationOverview").hidden) loadInstallationIncidentsOverview();
  return incident;
}

function openInstallationReport(installation) {
  const options = Object.entries(INSTALLATION_INCIDENT_TYPES).map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  const overlay = installationDialog("Signaler un incident", installation.name, `<div class="installation-form">
    <label>Type de problème<select id="installationIncidentType">${options}</select></label>
    <label>Niveau<select id="installationIncidentUrgency"><option value="NORMAL">Normal</option><option value="URGENT">Urgent</option></select></label>
    <label>Que se passe-t-il ?<textarea id="installationIncidentDescription" rows="4" placeholder="Ex : eau anormalement froide dans le bassin"></textarea></label>
    <label>Photo (facultative)<input id="installationIncidentPhoto" type="file" accept="image/*"></label>
    <label>Prendre une photo<input id="installationIncidentCamera" type="file" accept="image/*" capture="environment"></label>
    <div id="installationPhotoPreview"></div><button type="button" class="secondary" id="installationPhotoRemove" hidden>Retirer la photo</button>
    <p class="muted">Le responsable verra ce signalement dans son espace dédié. Aucun numéro de téléphone n'est nécessaire.</p>
    <div class="error" id="installationIncidentError"></div>
    <div class="installation-dialog-actions"><button type="button" class="secondary" data-installation-close-2>Annuler</button><button type="button" id="installationIncidentSend">Envoyer le signalement</button></div>
  </div>`);
  let photo='', processing=false, photoRevision=0;
  const preview=overlay.querySelector('#installationPhotoPreview'), remove=overlay.querySelector('#installationPhotoRemove');
  const choosePhoto=async event=>{
    const file=event.target.files?.[0];if(!file)return;
    const revision=++photoRevision;processing=true;overlay.querySelector('#installationIncidentSend').disabled=true;
    overlay.querySelector('#installationIncidentError').textContent='';
    try { const value=await InstallationPhoto.compress(file);if(revision===photoRevision){photo=value;preview.innerHTML=InstallationPhoto.html(photo);remove.hidden=false;} }
    catch(e){overlay.querySelector('#installationIncidentError').textContent=e.message;}
    finally {if(revision===photoRevision){processing=false;overlay.querySelector('#installationIncidentSend').disabled=false;}}
  };
  overlay.querySelector('#installationIncidentPhoto').onchange=choosePhoto;
  overlay.querySelector('#installationIncidentCamera').onchange=choosePhoto;
  remove.onclick=()=>{photoRevision++;photo='';processing=false;preview.innerHTML='';remove.hidden=true;overlay.querySelector('#installationIncidentPhoto').value='';overlay.querySelector('#installationIncidentCamera').value='';overlay.querySelector('#installationIncidentSend').disabled=false;};
  overlay.querySelector("[data-installation-close-2]").addEventListener("click", closeInstallationDialog);
  overlay.querySelector("#installationIncidentSend").addEventListener("click", async () => {
    if(processing)return;
    const type = overlay.querySelector("#installationIncidentType").value;
    const urgency = overlay.querySelector("#installationIncidentUrgency").value;
    const description = overlay.querySelector("#installationIncidentDescription").value.trim();
    const error = overlay.querySelector("#installationIncidentError");
    if (!description) { error.textContent = "Décrivez le problème avant l'envoi."; return; }
    const button = overlay.querySelector("#installationIncidentSend");
    button.disabled = true;
    try {
      if (!await installationDeliveryReady()) throw new Error("Aucun compte responsable n'est encore autorisé pour cet établissement. Demandez au professeur administrateur de le configurer avant l'envoi.");
      await enregistrerIncidentInstallation(installation, type, description, urgency, photo);
      closeInstallationDialog();
      openInstallationHistory(installation);
    } catch (e) {
      error.textContent = e.message;
      button.disabled = false;
    }
  });
}

async function openInstallationHistory(installation) {
  const overlay = installationDialog("Suivi des interventions", installation.name,
    '<div class="installation-history-list"><div class="muted">Chargement...</div></div>');
  const host = overlay.querySelector(".installation-history-list");
  try {
    const incidents = await readSharedInstallationIncidents(
      `sport_installation_incidents?installation_name=eq.${encodeURIComponent(installation.name)}&deleted=eq.false&select=*&order=reported_at.desc`,
      { ou: row => row.installation_name === installation.name && !row.deleted,
        trier: (a, b) => String(b.reported_at || "").localeCompare(String(a.reported_at || "")) });
    let interventions = [];
    if (navigator.onLine && incidents.length) {
      try {
        const response = await apiFetch(`${SUPABASE_URL}/rest/v1/eps_installation_interventions?select=*&order=created_at.asc`);
        interventions = await response.json();
      } catch { /* Les statuts restent visibles si l'historique détaillé est momentanément indisponible. */ }
    }
    const rows = incidents.map(incident => `<article class="installation-history-card">
      <div><span class="installation-status ${String(incident.status || "").toLowerCase()}">${planningText(INSTALLATION_STATUS_LABELS[incident.status] || incident.status)}</span><small>${new Date(incident.reported_at).toLocaleString("fr-FR")}</small></div>
      <strong>${planningText(INSTALLATION_INCIDENT_TYPES[incident.incident_type] || incident.incident_type)}</strong>
      <p>${planningText(incident.description)}</p>
      ${InstallationPhoto.html(incident.photo_data)}
      ${interventions.filter(event => event.incident_id === incident.id).map(event => `<div class="installation-history-event"><strong>${planningText(INSTALLATION_STATUS_LABELS[event.status] || event.status)}</strong> · ${new Date(event.created_at).toLocaleString("fr-FR")}${event.note ? `<p>${planningText(event.note)}</p>` : ""}</div>`).join("")}
      </article>`).join("");
    host.innerHTML = rows || '<div class="muted installation-history-empty">Aucun signalement ni intervention pour cette installation.</div>';
  } catch (e) {
    host.innerHTML = `<div class="error">${planningText(e.message)}</div>`;
  }
}


// Noms attendus par rafraichirApresSynchro : les listes se redessinent quand une synchronisation
// ramene du materiel ou des EPI saisis sur un autre appareil.
globalThis.loadEquipmentList = () => { if (document.getElementById("equipTab-materiel")) loadEquipment(); };
globalThis.loadEpiList = () => { if (document.getElementById("equipTab-epi")) loadEpiItems(); };
