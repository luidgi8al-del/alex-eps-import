/*
 * Onglet CLASSE : sous-onglets, lecture de CSV, liste des classes et modification d'une classe.
 *
 * Sorti d'index.html. Script classique, comme les dix autres fichiers du site :
 * les fonctions restent accessibles depuis les autres fichiers sans rien exporter,
 * et ce fichier est charge avant le script principal qui s'en sert.
 */

// ---- Sous-onglets du module Classes : "Classes" (creees, modifiables) / "Nouvel import classe" ----
const SUBTAB_NAMES = ["liste", "newimport", "classes"];
function showSubtab(name) {
  SUBTAB_NAMES.forEach(sub => {
    document.getElementById("subtab-" + sub).style.display = sub === name ? "block" : "none";
  });
  document.querySelectorAll("#classesSubtabs .subtabbtn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.subtab === name);
  });
  if (name === "classes") loadImports();
  if (name === "liste") ouvrirListeEleve();
}

/**
 * Vrai si le compte administre l'etablissement.
 *
 * Sert a ne pas proposer des actions que la base refusera : mieux vaut un bouton absent qu'un
 * bouton qui echoue. La reponse est mise de cote, le contexte d'equipe etant deja relu a
 * l'ouverture des reglages.
 *
 * Ce n'est qu'un confort d'affichage : la vraie interdiction vit dans les regles de la base
 * (schema_droits_administrateur.sql), seules capables de resister a un contournement.
 */
let estAdminCache = null;
async function estAdministrateur() {
  if (estAdminCache !== null) return estAdminCache;
  const contexte = await loadTeamContext().catch(() => null);
  estAdminCache = !!(contexte && contexte.is_admin);
  return estAdminCache;
}

/**
 * Le repertoire s'affiche dans deux onglets : Liste eleve (sous Classe) et Licencies AS.
 * C'est la meme liste, filtree differemment - il ne doit donc en rester qu'un rendu a la fois,
 * sinon deux boutons de meme identifiant coexisteraient et le mauvais recevrait les clics.
 */
let unssCibleRendu = "unssList";
function viderAutreRendu(cible) {
  const autre = cible === "unssList" ? "listeEleveList" : "unssList";
  const el = document.getElementById(autre);
  if (el) el.innerHTML = "";
}

async function ouvrirListeEleve() {
  unssCibleRendu = "listeEleveList";
  unssMode = "all";
  unssPage = 1;
  viderAutreRendu("listeEleveList");
  unssAdmin = await estAdministrateur();
  await loadUnssStudents();
  renderUnssTab();
}
document.getElementById("classesSubtabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".subtabbtn");
  if (btn) showSubtab(btn.dataset.subtab);
});
let classCreationMode = null;
function selectClassCreationMode(mode) {
  classCreationMode = mode;
  document.getElementById("classCreationForm").style.display = "block";
  document.getElementById("fileImportFields").style.display = mode === "file" ? "block" : "none";
  document.getElementById("manualClassMode").classList.toggle("secondary", mode !== "manual");
  document.getElementById("fileClassMode").classList.toggle("secondary", mode !== "file");
  document.getElementById("manualClassMode").setAttribute("aria-pressed", String(mode === "manual"));
  document.getElementById("fileClassMode").setAttribute("aria-pressed", String(mode === "file"));
  document.getElementById("sendBtn").textContent = mode === "file" ? "Créer la classe et importer" : "Créer la classe";
  if (mode === "manual") {
    parsedStudents = [];
    document.getElementById("csvFile").value = "";
    document.getElementById("previewWrap").style.display = "none";
  }
}
document.getElementById("manualClassMode").addEventListener("click", () => selectClassCreationMode("manual"));
document.getElementById("fileClassMode").addEventListener("click", () => selectClassCreationMode("file"));
document.getElementById("syncBtn").addEventListener("click", async () => {
  const btn = document.getElementById("syncBtn");
  btn.disabled = true; btn.textContent = "Synchronisation...";
  await loadImports();
  btn.disabled = false; btn.textContent = "Synchroniser";
});

// ---- CSV parsing (memes regles que l'app Android) ----
function normalizeHeader(v) {
  return v.trim().toLowerCase().replace(/é/g, "e").replace(/è/g, "e").replace(/ê/g, "e").replace(/à/g, "a").replace(/î/g, "i");
}
const HEADER_ALIASES = {
  nom: ["nom", "nom de famille", "lastname", "last name"],
  prenom: ["prenom", "firstname", "first name"],
  sexe: ["sexe", "sex", "genre"],
  niveau: ["niveau eps", "niveau", "niveaueps", "level"],
  emailEleve: ["email eleve", "emails eleve", "mail eleve", "email eleve(s)", "email"],
  emailsParents: ["emails parents", "email parents", "email parent", "emails parent", "mail parents", "mails parents"]
};
function detectDelimiter(line) {
  const semi = (line.match(/;/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  return semi > comma ? ";" : ",";
}
function parseCsvLine(line, delimiter) {
  const fields = [];
  let current = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes && c === '"' && line[i + 1] === '"') { current += '"'; i++; }
    else if (c === '"') { inQuotes = !inQuotes; }
    else if (c === delimiter && !inQuotes) { fields.push(current.trim()); current = ""; }
    else { current += c; }
  }
  fields.push(current.trim());
  return fields;
}
// Coupe "NOM Prenom" (ou "Prenom NOM") en {last, first}. Repere le(s) mot(s) tout en
// MAJUSCULES comme le nom de famille (convention francaise courante, ex: exports Pronote).
// Si aucune casse ne se distingue, retombe sur la convention "Prenom Nom".
function splitFullName(raw) {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { last: "", first: "" };
  if (words.length === 1) return { last: words[0], first: "" };
  const isUpper = w => w === w.toUpperCase() && w !== w.toLowerCase();
  const upperWords = words.filter(isUpper);
  const lowerWords = words.filter(w => !isUpper(w));
  if (upperWords.length > 0 && lowerWords.length > 0) {
    return { last: upperWords.join(" "), first: lowerWords.join(" ") };
  }
  return { first: words[0], last: words.slice(1).join(" ") };
}
const COMBINED_NAME_ALIASES = ["nom prenom", "nom et prenom", "nom complet", "eleve", "nom eleve", "prenom nom", "nom prenom eleve"];

// ---- Detection par contenu (en complement des en-tetes), sur les colonnes non identifiees ----
function sexFromValue(v) {
  const t = normalizeHeader(v);
  if (["f", "fille", "femme", "feminin"].includes(t)) return "FILLE";
  if (["g", "m", "garcon", "homme", "masculin"].includes(t)) return "GARCON";
  return null;
}
function looksLikeSexColumn(values) {
  const nonBlank = values.filter(v => v.trim());
  return nonBlank.length > 0 && nonBlank.every(v => sexFromValue(v) !== null);
}
function looksLikeNiveauColumn(values) {
  const nonBlank = values.filter(v => v.trim());
  return nonBlank.length > 0 && nonBlank.every(v => /^[1-5]$/.test(v.trim()));
}
function emailDomain(v) {
  const at = v.indexOf("@");
  return at >= 0 ? v.slice(at + 1).trim().toLowerCase() : null;
}
// Une colonne "ressemble" a un nom complet si chaque valeur contient au moins deux mots
// composes uniquement de lettres (accents, apostrophes, traits d'union tolérés).
function looksLikeNameColumn(values) {
  const nonBlank = values.filter(v => v.trim());
  if (nonBlank.length === 0) return false;
  return nonBlank.every(v => {
    const words = v.trim().split(/\s+/).filter(Boolean);
    return words.length >= 2 && /^[A-Za-zÀ-ÿ'’\-\s]+$/.test(v.trim());
  });
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { students: [], niveauDetected: false };
  const delimiter = detectDelimiter(lines[0]);
  const headerFields = parseCsvLine(lines[0], delimiter).map(normalizeHeader);
  const colIndex = key => headerFields.findIndex(h => HEADER_ALIASES[key].includes(h));
  const idx = { nom: colIndex("nom"), prenom: colIndex("prenom"), sexe: colIndex("sexe"), niveau: colIndex("niveau"), emailEleve: colIndex("emailEleve"), emailsParents: colIndex("emailsParents") };
  let combinedIndex = headerFields.findIndex(h => COMBINED_NAME_ALIASES.includes(h));
  // La premiere ligne est un en-tete des qu'au moins une colonne a ete reconnue par son
  // intitule — meme si, comme Nom/Prenom, elle reste elle-meme a identifier par son contenu.
  const hasAnyRecognizedHeader = Object.values(idx).some(v => v >= 0) || combinedIndex >= 0;
  const dataLines = hasAnyRecognizedHeader ? lines.slice(1) : lines;
  const dataRows = dataLines.map(l => parseCsvLine(l, delimiter));
  const columnCount = Math.max(headerFields.length, ...dataRows.map(r => r.length), 0);
  const columnValues = c => dataRows.map(r => r[c] || "");

  // Passe de detection par contenu pour les colonnes pas encore identifiees par leur en-tete.
  const claimed = new Set([idx.nom, idx.prenom, idx.sexe, idx.niveau, idx.emailEleve, idx.emailsParents, combinedIndex].filter(i => i >= 0));
  if (idx.sexe < 0) {
    for (let c = 0; c < columnCount; c++) {
      if (!claimed.has(c) && looksLikeSexColumn(columnValues(c))) { idx.sexe = c; claimed.add(c); break; }
    }
  }
  if (idx.niveau < 0) {
    for (let c = 0; c < columnCount; c++) {
      if (!claimed.has(c) && looksLikeNiveauColumn(columnValues(c))) { idx.niveau = c; claimed.add(c); break; }
    }
  }
  if (idx.nom < 0 && idx.prenom < 0 && combinedIndex < 0) {
    for (let c = 0; c < columnCount; c++) {
      if (!claimed.has(c) && looksLikeNameColumn(columnValues(c))) { combinedIndex = c; claimed.add(c); break; }
    }
  }
  const useCombined = (idx.nom < 0 || idx.prenom < 0) && combinedIndex >= 0;
  const hasHeader = (idx.nom >= 0 && idx.prenom >= 0) || useCombined;
  if (idx.emailEleve < 0 || idx.emailsParents < 0) {
    const domainField = document.getElementById("studentEmailDomain");
    const domainOverride = domainField ? normalizeHeader(domainField.value).replace(/\s/g, "") : "";
    const emailCols = [];
    for (let c = 0; c < columnCount; c++) {
      if (claimed.has(c)) continue;
      const vals = columnValues(c).filter(v => v.trim());
      if (vals.length > 0 && vals.every(v => v.includes("@"))) emailCols.push(c);
    }
    // La colonne "email eleve" est reconnue soit par le domaine indique, soit (a defaut)
    // comme la colonne dont toutes les adresses partagent le meme domaine (mail d'etablissement),
    // les mails parents etant eux repartis sur des domaines varies.
    let studentCol = null;
    for (const c of emailCols) {
      const vals = columnValues(c).filter(v => v.trim());
      if (domainOverride && vals.every(v => emailDomain(v) === domainOverride)) { studentCol = c; break; }
    }
    if (studentCol === null && !domainOverride) {
      let bestCount = Infinity;
      for (const c of emailCols) {
        const vals = columnValues(c).filter(v => v.trim());
        const domains = new Set(vals.map(emailDomain));
        if (domains.size === 1 && domains.size < bestCount) { bestCount = domains.size; studentCol = c; }
      }
    }
    if (idx.emailEleve < 0 && studentCol !== null) { idx.emailEleve = studentCol; claimed.add(studentCol); }
    if (idx.emailsParents < 0) {
      const remaining = emailCols.find(c => c !== studentCol && !claimed.has(c));
      if (remaining !== undefined) { idx.emailsParents = remaining; claimed.add(remaining); }
    }
  }

  const students = [];
  for (const f of dataRows) {
    const get = i => (i >= 0 ? (f[i] || "") : "");
    let lastName, firstName;
    if (useCombined) {
      const split = splitFullName(get(combinedIndex));
      lastName = split.last; firstName = split.first;
    } else if (hasHeader) {
      lastName = get(idx.nom); firstName = get(idx.prenom);
    } else {
      lastName = f[1] || ""; firstName = f[0] || "";
    }
    if (!lastName || !firstName) continue;
    students.push({
      last_name: lastName, first_name: firstName,
      sex: sexFromValue(get(idx.sexe)) || "NON_PRECISE",
      eps_level: idx.niveau >= 0 ? (get(idx.niveau) || "MOYEN") : "MOYEN",
      student_email: get(idx.emailEleve) || null,
      parent_emails: get(idx.emailsParents) || null,
      ...studentExtraColumns(headerFields, f)
    });
  }
  return { students, niveauDetected: idx.niveau >= 0 };
}

// Memes 5 niveaux que ceux geres partout ailleurs dans l'application (fiche eleve, etc).
const LEVEL_OPTIONS = [
  { value: "1", label: "1 - Debutant" },
  { value: "2", label: "2 - Fragile" },
  { value: "3", label: "3 - Moyen" },
  { value: "4", label: "4 - Bon" },
  { value: "5", label: "5 - Tres bon" }
];

let niveauEditable = false;

function levelSelectHtml(index, currentValue) {
  const options = LEVEL_OPTIONS.map(opt =>
    `<option value="${opt.value}"${opt.value === currentValue ? " selected" : ""}>${opt.label}</option>`
  ).join("");
  return `<select class="levelSelect" data-index="${index}">${options}</select>`;
}

function renderPreviewTable() {
  const body = document.getElementById("previewBody");
  body.innerHTML = "";
  parsedStudents.forEach((s, i) => {
    const tr = document.createElement("tr");
    const niveauCell = niveauEditable ? levelSelectHtml(i, s.eps_level) : s.eps_level;
    tr.innerHTML = `<td>${s.last_name}</td><td>${s.first_name}</td><td>${s.sex}</td><td>${niveauCell}</td><td>${s.student_email || ""}</td><td>${s.parent_emails || ""}</td>`;
    body.appendChild(tr);
  });
  document.getElementById("previewCount").textContent = `${parsedStudents.length} eleve(s) detecte(s).`;
}

document.getElementById("previewBody").addEventListener("change", (e) => {
  const select = e.target.closest(".levelSelect");
  if (!select) return;
  const index = parseInt(select.dataset.index, 10);
  parsedStudents[index].eps_level = select.value;
});

document.getElementById("csvFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  document.getElementById("parseError").textContent = "";
  document.getElementById("previewWrap").style.display = "none";
  document.getElementById("sendOk").textContent = "";
  document.getElementById("sendError").textContent = "";
  if (!file) return;
  const text = await file.text();
  const { students, niveauDetected } = parseCsv(text);
  if (students.length === 0) {
    document.getElementById("parseError").textContent = "Aucun eleve reconnu dans ce fichier. Verifiez les colonnes.";
    return;
  }
  parsedStudents = students;
  niveauEditable = !niveauDetected;
  if (niveauEditable) parsedStudents.forEach(s => { s.eps_level = "3"; });
  document.getElementById("niveauHint").style.display = niveauEditable ? "block" : "none";
  renderPreviewTable();
  document.getElementById("previewWrap").style.display = "block";
});

// Coupe la cellule "Emails parents" (une ou deux adresses) en 2 colonnes distinctes, comme
// cote app (StudentCsv.kt / splitParentEmails) : les tables classes/students sont un vrai
// miroir du modele de donnees de l'application, pas juste un CSV brut.
function splitParentEmailsField(value) {
  const parts = (value || "").split(/[;, ]/).map(v => v.trim()).filter(Boolean);
  return [parts[0] || null, parts[1] || null];
}

document.getElementById("sendBtn").addEventListener("click", async () => {
  const sendError = document.getElementById("sendError");
  const sendOk = document.getElementById("sendOk");
  sendError.textContent = ""; sendOk.textContent = "";
  const grade = document.getElementById("grade").value;
  const classNumber = parseInt(document.getElementById("classNumber").value, 10);
  const schoolYear = document.getElementById("schoolYear").value.trim();
  if (!schoolYear) { sendError.textContent = "Annee scolaire requise."; return; }
  try {
    const className = creationClassName(grade, classNumber);
    const classId = crypto.randomUUID();
    const now = new Date().toISOString();
    const classRes = await apiFetch(`${SUPABASE_URL}/rest/v1/classes`, {
      method: "POST",
      body: JSON.stringify({
        id: classId, user_id: session.user_id, grade, class_number: classNumber,
        school_year: schoolYear, name: className,
        // Vide quand la classe est pour soi : le declencheur cote base refuse une attribution
        // faite par un non-administrateur ou vers un professeur d'un autre etablissement.
        assigned_teacher_id: (document.getElementById("assignedTeacher") || {}).value || null,
        updated_at: now, deleted: false
      })
    });
    if (!classRes.ok) {
      const details = await classRes.text();
      throw new Error(`Echec de creation de la classe${details ? ` : ${details}` : "."}`);
    }

    if (parsedStudents.length > 0) {
      const studentsPayload = parsedStudents.map(s => {
        const [parent1, parent2] = splitParentEmailsField(s.parent_emails);
        return {
          id: crypto.randomUUID(), class_id: classId, user_id: session.user_id,
          last_name: s.last_name, first_name: s.first_name, sex: s.sex, eps_level: s.eps_level,
          student_email: s.student_email || null, parent1_email: s.parent1_email || parent1, parent2_email: s.parent2_email || parent2,
          birth_date_epoch_millis:s.birth_date_epoch_millis, parent_phone:s.parent_phone, extended_data_updated_at:now,
          updated_at: now, deleted: false
        };
      });
      const studentsRes = await apiFetch(`${SUPABASE_URL}/rest/v1/students`, {
        method: "POST",
        body: JSON.stringify(studentsPayload)
      });
      if (!studentsRes.ok) throw new Error("Echec de l'envoi des eleves.");
    }

    sendOk.textContent = "Enregistre. Synchronisez l'application (bouton Synchroniser) pour la recuperer.";
    document.getElementById("csvFile").value = "";
    document.getElementById("previewWrap").style.display = "none";
    showSubtab("classes");
  } catch (e) {
    sendError.textContent = e.message;
  }
});

// ---- Liste des classes creees/envoyees ----
const GRADE_LABELS = { SIXIEME: "6e", CINQUIEME: "5e", QUATRIEME: "4e", TROISIEME: "3e", SECONDE: "2nde", PREMIERE: "1ere", TERMINALE: "Tle" };
Object.assign(GRADE_LABELS, EXTRA_SCHOOL_LEVELS);

/**
 * Niveaux dont une classe se distingue par son creneau et son enseignant, pas par un numero :
 * plusieurs professeurs ont une Terminale, "Tle1" ne dirait pas laquelle. La Premiere suit la
 * meme logique, avec ses deux horaires.
 */
function creneauxNommes(grade) {
  // L'EPPCS a son propre emploi du temps : ses deux jours ne sont pas ceux du tronc commun.
  if (grade === "TERMINALE_EPPCS") {
    return { libelle: "Terminale EPPCS", choix: ["Mardi", "Mercredi"], intitule: "Jour de la Terminale EPPCS" };
  }
  const base = baseSchoolLevel(grade);
  if (base === "TERMINALE") return { libelle: "Terminale", choix: ["Lundi", "Jeudi"], intitule: "Jour de la Terminale" };
  if (base === "PREMIERE") return { libelle: "Première", choix: ["14h", "16h"], intitule: "Creneau de la Première" };
  return null;
}

function creationClassName(grade, number) {
  const regle = creneauxNommes(grade);
  if (!regle) return `${GRADE_LABELS[grade] || grade}${EXTRA_SCHOOL_LEVELS[grade] ? " " : ""}${number}`;
  const teacher = (loadPrefs().teacherName || "").trim();
  if (!teacher) throw new Error(`Renseignez votre nom dans Réglage → Profil enseignant avant de créer une ${regle.libelle}.`);
  if (![1, 2].includes(number)) throw new Error(`Choisissez ${regle.choix[0]} ou ${regle.choix[1]} pour la ${regle.libelle}.`);
  return `${EXTRA_SCHOOL_LEVELS[grade] || regle.libelle} ${regle.choix[number - 1]} — ${teacher}`;
}
function updateClassDayChoice(gradeId, numberId, selected) {
  const regle = creneauxNommes(document.getElementById(gradeId).value);
  const select = document.getElementById(numberId);
  const previous = selected ?? select.value;
  select.replaceChildren();
  const teacher = (loadPrefs().teacherName || "").trim();
  const labels = regle ? regle.choix : ["1","2","3","4","5","6","7","8","9"];
  labels.forEach((label, index) => select.add(new Option(regle && teacher ? `${label} — ${teacher}` : label, String(index + 1))));
  document.querySelector(`label[for="${numberId}"]`).textContent = regle ? regle.intitule : "Numéro de classe";
  // Une classe numerotee qui passe a un niveau a creneaux doit se voir attribuer son creneau.
  select.value = regle && selected != null ? "" : (labels[Number(previous)-1] ? String(previous) : "1");
}
document.getElementById("grade").addEventListener("change", () => updateClassDayChoice("grade", "classNumber"));
document.getElementById("editGrade").addEventListener("change", () => updateClassDayChoice("editGrade", "editClassNumber"));

/**
 * Attribution d'une classe a un collegue : c'est ainsi qu'un administrateur prepare le compte
 * d'un professeur avant meme sa premiere connexion. Le modele reprend celui des groupes AS
 * (assigned_teacher_id) : personne ne se connecte a la place de personne.
 */
let collegues = [];

async function chargerColleguesAttribuables() {
  const contexte = await loadTeamContext().catch(() => null);
  const ligne = document.getElementById("assignedTeacherRow");
  if (!contexte || !contexte.is_admin) { collegues = []; if (ligne) ligne.style.display = "none"; return; }
  collegues = (contexte.members || []).filter(m => m.id !== session.user_id);
  if (!ligne) return;
  if (collegues.length === 0) { ligne.style.display = "none"; return; }
  const select = document.getElementById("assignedTeacher");
  select.innerHTML = '<option value="">Pour moi</option>'
    + collegues.map(m => `<option value="${m.id}">${planningText(m.name || m.email)}</option>`).join("");
  ligne.style.display = "block";
}

function nomCollegue(id) {
  const trouve = collegues.find(m => m.id === id);
  return trouve ? (trouve.name || trouve.email) : "un collegue";
}

async function loadImports() {
  const listEl = document.getElementById("importsList");
  listEl.innerHTML = '<div class="muted">Chargement...</div>';
  try {
    await chargerColleguesAttribuables();
    const res = await apiFetch(`${SUPABASE_URL}/rest/v1/classes?deleted=eq.false&select=*&order=name.asc`);
    const rows = await res.json();
    if (!res.ok) throw new Error("Impossible de charger les classes.");
    if (rows.length === 0) {
      listEl.innerHTML = '<div class="muted">Aucune classe pour le moment.</div>';
      return;
    }
    // Une rangee de noms, comme dans l'application : la liste verticale tenait sur trois
    // ecrans des qu'un etablissement complet etait saisi, et chaque classe y montrait ses
    // quatre boutons en permanence. Ici on ne voit que les noms, et rien n'est ouvert tant
    // qu'on n'a pas choisi.
    if (!rows.some(r => r.id === classeOuverteId)) classeOuverteId = null;
    // Aucune classe retenue : le panneau d'une classe supprimee ou d'une autre session ne
    // doit pas rester ouvert sous une rangee ou plus rien n'est selectionne.
    if (!classeOuverteId) {
      document.getElementById("classDashboardPanel").style.display = "none";
      document.getElementById("classSchedulePanel").style.display = "none";
    }
    const barre = document.createElement("div");
    barre.className = "classeBarre";
    classesConnues = rows;
    rows.forEach(r => {
      const label = planningText(planningClassLabel(r));
      const puce = document.createElement("button");
      puce.type = "button";
      puce.className = "classePuce" + (r.id === classeOuverteId ? " active" : "");
      puce.innerHTML = `${label}<span class="annee">${planningText(r.school_year || "")}</span>`;
      puce.addEventListener("click", () => {
        // Recliquer sur la classe ouverte la referme : c'est le seul moyen de revenir a un
        // ecran vide sans avoir a chercher un bouton "Fermer".
        if (r.id === classeOuverteId) { fermerTableauDeBord(); return; }
        classeOuverteId = r.id;
        barre.querySelectorAll(".classePuce").forEach(b => b.classList.remove("active"));
        puce.classList.add("active");
        openClassDashboard(r, label);
      });
      barre.appendChild(puce);
    });
    listEl.innerHTML = "";
    listEl.appendChild(barre);
  } catch (e) {
    listEl.innerHTML = `<div class="error">${e.message}</div>`;
  }
}

// Suppression douce (tombstone), pas un DELETE SQL : sinon la suppression ne se propagerait
// jamais vers l'application au prochain Synchroniser, qui verrait juste une ligne disparue
// (indiscernable d'une ligne jamais recuperee) au lieu d'une suppression explicite a repercuter.
async function deleteImport(id) {
  const now = new Date().toISOString();
  await apiFetch(`${SUPABASE_URL}/rest/v1/classes?id=eq.${id}`, {
    method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: now })
  });
  await apiFetch(`${SUPABASE_URL}/rest/v1/students?class_id=eq.${id}`, {
    method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: now })
  });
  loadImports();
}

// ---- Modifier une classe deja envoyee : metadonnees + liste de ses eleves ----
/** Classe dépliée dans la liste : une seule a la fois, d'ou un identifiant et non un ensemble. */
let classeOuverteId = null;
let editImportId = null;
let editStudents = [];
let editStudentsToDelete = [];

function editStudentRowHtml(index, s) {
  const sexOptions = ["FILLE", "GARCON", "NON_PRECISE"].map(v =>
    `<option value="${v}"${v === s.sex ? " selected" : ""}>${v}</option>`
  ).join("");
  const levelOptions = LEVEL_OPTIONS.map(opt =>
    `<option value="${opt.value}"${opt.value === s.eps_level ? " selected" : ""}>${opt.label}</option>`
  ).join("");
  return `
    <tr class="editRow" data-index="${index}">
      <td><input type="text" data-field="last_name" value="${planningText(s.last_name || "")}"></td>
      <td><input type="text" data-field="first_name" value="${planningText(s.first_name || "")}"></td>
      <td><select data-field="sex">${sexOptions}</select></td>
      <td><select class="levelSelect" data-field="eps_level">${levelOptions}</select></td>
      <td><input type="text" data-field="student_email" value="${planningText(s.student_email || "")}"></td>
      <td><input type="text" data-field="parent1_email" placeholder="Parent 1" value="${planningText(s.parent1_email || "")}"><input type="text" data-field="parent2_email" placeholder="Parent 2" value="${planningText(s.parent2_email || "")}"></td>
      <td><input type="date" data-field="birth_date" value="${s.birth_date_epoch_millis != null ? new Date(Number(s.birth_date_epoch_millis)).toISOString().slice(0,10) : ""}"></td>
      <td><input type="tel" data-field="parent_phone" value="${planningText(s.parent_phone || "")}"></td>
      <td><button class="danger" data-action="removeRow" style="margin-top:0">Suppr.</button></td>
    </tr>`;
}

function renderEditStudents() {
  const body = document.getElementById("editStudentsBody");
  body.innerHTML = editStudents.map((s, i) => editStudentRowHtml(i, s)).join("");
  body.querySelectorAll('[data-action="removeRow"]').forEach(btn => {
    btn.addEventListener("click", (e) => {
      const index = parseInt(e.target.closest(".editRow").dataset.index, 10);
      const removed = editStudents[index];
      if (removed.id) editStudentsToDelete.push(removed.id);
      editStudents.splice(index, 1);
      renderEditStudents();
    });
  });
}

async function openEditImport(row) {
  editImportId = row.id;
  editStudentsToDelete = [];
  document.getElementById("editGrade").value = row.grade;
  updateClassDayChoice("editGrade", "editClassNumber", row.class_number);
  // Une classe deja nommee selon la convention garde son creneau ; les anciennes classes
  // numerotees restent sans choix, pour obliger a le preciser.
  const regleEdition = creneauxNommes(row.grade);
  if (regleEdition && new RegExp(`^${regleEdition.libelle}(?: EPPCS)? (${regleEdition.choix.join("|")}) — `).test(row.name || "")) {
    document.getElementById("editClassNumber").value = row.class_number;
  }
  document.getElementById("editSchoolYear").value = row.school_year;
  document.getElementById("editError").textContent = "";
  document.getElementById("editImportPanel").style.display = "block";
  document.getElementById("editStudentsBody").innerHTML = '<tr><td colspan="7" class="muted">Chargement...</td></tr>';
  const res = await apiFetch(`${SUPABASE_URL}/rest/v1/students?class_id=eq.${row.id}&deleted=eq.false&select=*&order=last_name.asc`);
  editStudents = res.ok ? await res.json() : [];
  renderEditStudents();
}

document.getElementById("closeEditBtn").addEventListener("click", () => {
  document.getElementById("editImportPanel").style.display = "none";
});

document.getElementById("addStudentBtn").addEventListener("click", () => {
  // Une ligne vide, sans identifiant : c'est ce qui la distingue d'un eleve deja enregistre
  // au moment de l'enregistrement.
  document.querySelectorAll("#editStudentsBody .editRow").forEach(tr => {
    const student = editStudents[parseInt(tr.dataset.index, 10)];
    tr.querySelectorAll("[data-field]").forEach(f => { student[f.dataset.field] = f.value.trim() || null; });
  });
  editStudents.push({ last_name: "", first_name: "", sex: "NON_PRECISE" });
  renderEditStudents();
  const lignes = document.querySelectorAll("#editStudentsBody .editRow");
  const derniere = lignes[lignes.length - 1];
  if (derniere) { derniere.scrollIntoView({ block: "center" }); derniere.querySelector("[data-field]")?.focus(); }
});

document.getElementById("saveEditBtn").addEventListener("click", async () => {
  const errorEl = document.getElementById("editError");
  errorEl.textContent = "";
  document.querySelectorAll("#editStudentsBody .editRow").forEach(tr => {
    const index = parseInt(tr.dataset.index, 10);
    const student = editStudents[index];
    tr.querySelectorAll("[data-field]").forEach(field => {
      student[field.dataset.field] = field.value.trim() || null;
    });
  });
  const now = new Date().toISOString();
  try {
    const grade = document.getElementById("editGrade").value;
    const classNumber = parseInt(document.getElementById("editClassNumber").value, 10);
    const importRes = await apiFetch(`${SUPABASE_URL}/rest/v1/classes?id=eq.${editImportId}`, {
      method: "PATCH",
      body: JSON.stringify({
        grade, class_number: classNumber,
        school_year: document.getElementById("editSchoolYear").value.trim(),
        name: creationClassName(grade, classNumber), updated_at: now
      })
    });
    if (!importRes.ok) throw new Error("Echec de mise a jour de la classe.");

    for (const id of editStudentsToDelete) {
      await apiFetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${id}`, {
        method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: now })
      });
    }
    const champs = s => ({
      last_name: s.last_name, first_name: s.first_name, sex: s.sex,
      eps_level: s.eps_level, student_email: s.student_email,
      parent1_email: s.parent1_email, parent2_email: s.parent2_email,
      birth_date_epoch_millis: s.birth_date ? Date.parse(s.birth_date + "T00:00:00Z") : null,
      parent_phone: s.parent_phone, extended_data_updated_at: now, updated_at: now
    });

    // Un eleve ajoute n'a pas encore d'identifiant : le mettre a jour comme les autres
    // n'aurait rien ecrit du tout. Il faut le creer.
    const nouveaux = editStudents.filter(s => !s.id && (s.last_name || s.first_name));
    if (nouveaux.length) {
      const creationRes = await apiFetch(`${SUPABASE_URL}/rest/v1/students`, {
        method: "POST",
        body: JSON.stringify(nouveaux.map(s => ({
          id: crypto.randomUUID(), class_id: editImportId, user_id: session.user_id,
          ...champs(s), deleted: false
        })))
      });
      if (!creationRes.ok) throw new Error("Echec de l'ajout des nouveaux eleves.");
    }
    for (const s of editStudents.filter(s => s.id)) {
      await apiFetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${s.id}`, {
        method: "PATCH", body: JSON.stringify(champs(s))
      });
    }
    document.getElementById("editImportPanel").style.display = "none";
    loadImports();
  } catch (e) {
    errorEl.textContent = e.message;
  }
});
