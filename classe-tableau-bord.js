/*
 * Tableau de bord d'une classe : periodes, seances datees, grilles proposees, emploi du temps.
 *
 * Sorti d'index.html. Script classique, comme les dix autres fichiers du site :
 * les fonctions restent accessibles depuis les autres fichiers sans rien exporter,
 * et ce fichier est charge avant le script principal qui s'en sert.
 */

// ---- Tableau de bord d'une classe (miroir de ClassPeriodDashboard.kt) ----
// Une periode a la fois : l'activite programmee, ses exercices rapides, et l'acces
// direct aux evaluations. C'est la vue qu'on ouvre juste avant un cours.

let dashboardClass = null;
let dashboardPeriod = 1;
let dashboardActivities = [];
let dashboardExerciseType = "WARMUP";
// Ce que le tableau de bord doit connaitre pour ressembler a celui de l'application : le
// cycle porte la seance en cours, les evaluations et les tests alimentent le recapitulatif,
// les dispenses la derniere carte.
let classesConnues = [];
let dashboardCycles = [];
let dashboardEvaluations = [];
let dashboardTests = [];
let dashboardDispenses = [];
let dashboardStudents = [];
let dashboardSeanceEnregistrable = true;
let dashboardSlots = [];
/** Jour choisi quand la periode porte deux activites differentes. Null = celui d'aujourd'hui. */
let dashboardJour = null;
// Numero choisi a la main pendant cette visite. Le calendrier reprend la main au rechargement :
// un decalage ponctuel (seance annulee) ne doit pas figer l'affichage pour le reste du cycle.
let dashboardSeanceManuelle = null;

// ---- Calendrier des seances d'un cycle -------------------------------------------------
//
// Le professeur ne compte pas ses seances : il arrive un vendredi et veut la seance du
// vendredi. Les dates se deduisent du debut de periode et des creneaux de la classe - deux
// creneaux par semaine au college, un au lycee - sans rien demander de plus.

const JOURS_SEMAINE = ["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];

/** Debut et fin de la periode affichee, en ISO. La Terminale a son propre decoupage. */
function bornesPeriode(grade, periode) {
    const nombre = planningPeriodCount(grade);
    if (grade === "TERMINALE") {
        const p = (periodesTerminale || []).find(x => Number(x.number) === periode);
        if (p) return { debut: p.start_date, fin: p.end_date };
    }
    const standard = PERIODES_STANDARD[Math.min(periode, PERIODES_STANDARD.length) - 1];
    if (!standard) return null;
    const ajustee = periodeStandard(periode, nombre);
    return { debut: ajustee.start, fin: ajustee.end };
}

/**
 * Les dates des seances, dans l'ordre.
 *
 * On avance semaine apres semaine sur les jours de cours de la classe, a partir du debut de
 * periode, jusqu'a avoir le nombre de seances du cycle. Les vacances ne sont pas retirees :
 * la fin de periode borne deja la plage, et une seance decalee se corrige avec les boutons.
 */
function datesDesSeances(grade, periode, creneaux, nombreDeSeances) {
    const bornes = bornesPeriode(grade, periode);
    if (!bornes || !creneaux.length) return [];
    const joursDeCours = [...new Set(creneaux
        .map(c => JOURS_SEMAINE.indexOf(String(c.day_of_week || "").toUpperCase()))
        .filter(i => i >= 0))].sort((a, b) => a - b);
    if (!joursDeCours.length) return [];

    const dates = [];
    const curseur = new Date(bornes.debut + "T12:00:00");
    const limite = new Date(bornes.debut + "T12:00:00");
    limite.setFullYear(limite.getFullYear() + 1);   // garde-fou : jamais de boucle infinie
    while (dates.length < nombreDeSeances && curseur <= limite) {
        if (joursDeCours.includes(curseur.getDay())) dates.push(new Date(curseur));
        curseur.setDate(curseur.getDate() + 1);
    }
    return dates;
}

/**
 * La seance qui correspond a aujourd'hui : celle du jour s'il y a cours, sinon la prochaine,
 * et la derniere quand le cycle est passe. Rend un numero 1-indexe, ou null.
 */
function seanceDuJour(dates) {
    if (!dates.length) return null;
    const aujourdhui = new Date();
    aujourdhui.setHours(12, 0, 0, 0);
    const index = dates.findIndex(d => d.getTime() >= aujourdhui.getTime());
    return index >= 0 ? index + 1 : dates.length;
}

function dateSeanceLisible(date) {
    if (!date) return "";
    return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

// ---- Modeles d'evaluation (portage de CycleEvaluationTemplates.kt) ----------------------
//
// Trois grilles ponctuelles prises sur trois moments du cycle, et deux grilles finales : le
// bilan du cycle et la maitrise technique en situation de reference. Elles ne sont que des
// propositions - les utiliser cree des lignes independantes, modifiables ensuite.

/** Repartit 20 points sur les observables, au plus juste. */
function bareme20(observables) {
    const labels = [...new Set((observables || []).map(o => String(o).trim()).filter(Boolean))];
    if (!labels.length || labels.length > 20) return [];
    return labels.map((label, i) => ({
        label,
        max_points: Math.floor(20 / labels.length) + (i < 20 % labels.length ? 1 : 0)
    }));
}

function modelesEvaluation(contenu, grade, apsa) {
    if (!contenu || !contenu.sessions) return [];
    const seances = contenu.sessions;
    const pratique = seances
        .map((s, index) => ({ s, index }))
        .filter(x => !x.s.isDiagnostic && !x.s.isFinalEvaluation);
    if (pratique.length < 3) return [];

    const choisies = [pratique[0], pratique[Math.floor(pratique.length / 2)], pratique[pratique.length - 1]];
    const noyau = seance => (seance.situations || []).find(x => x.role === "NOYAU");
    const detail = situation => [
        situation.organization || "",
        ...(situation.instructions || []).map(i => "• " + i),
        (situation.execution || []).length ? "Reperes de realisation :" : "",
        ...(situation.execution || []).map(e => "• " + e)
    ].filter(Boolean).join("\n");

    const ponctuelles = choisies.map((x, i) => {
        const situation = noyau(x.s);
        if (!situation) return null;
        return {
            id: `${grade}:${apsa}:ponctuelle:${i}`, type: "PONCTUELLE",
            titre: `${apsa} · ${situation.title}`,
            source: `Cycle : S${x.index + 1} — ${x.s.theme}`,
            organisation: detail(situation),
            criteres: bareme20(situation.success)
        };
    }).filter(Boolean);

    const derniere = [...seances].reverse().find(s => s.isFinalEvaluation) || seances[seances.length - 1];
    const reference = noyau(derniere);
    const finale = contenu.finalEvaluation || {};
    const finales = [];
    if (finale.criteria && finale.criteria.length) {
        finales.push({
            id: `${grade}:${apsa}:finale:0`, type: "FINALE",
            titre: `${apsa} · Bilan du cycle`,
            source: `Évaluation finale du cycle · ${finale.referential || ""}`.trim(),
            organisation: finale.format || "",
            criteres: bareme20(finale.criteria)
        });
    }
    if (reference && (reference.execution || []).length) {
        finales.push({
            id: `${grade}:${apsa}:finale:1`, type: "FINALE",
            titre: `${apsa} · Maîtrise technique en situation finale`,
            source: `Grille technique — ${reference.title}`,
            organisation: detail(reference),
            criteres: bareme20(reference.execution)
        });
    }
    return ponctuelles.concat(finales);
}

/**
 * Tableau de bord d'une classe, calque sur celui de l'application (ClassPeriodDashboard.kt).
 *
 * Meme ordre, meme decoupage : periode, activite, seance en cours, fiches, evaluations,
 * recapitulatif, dispenses. Un professeur qui passe du telephone au navigateur doit
 * retrouver ses reperes sans reapprendre l'ecran.
 */
async function openClassDashboard(cls, label) {
  dashboardClass = { row: cls, label };
  dashboardPeriod = 1;
  dashboardSeanceManuelle = null;
  document.getElementById("classSchedulePanel").style.display = "none";
  const panel = document.getElementById("classDashboardPanel");
  panel.style.display = "block";
  panel.innerHTML = '<div class="muted">Chargement du tableau de bord...</div>';

  try {
    // Les activites d'une classe passent par ses creneaux : period_activities pointe sur le
    // creneau, pas sur la classe.
    // Le jour de la semaine sert a dater les seances : sans lui, impossible de dire que la
    // seance 2 tombe le vendredi.
    let slots;
    if (modeHorsConnexion) {
      slots = (await modeHorsConnexion.lire("class_schedule_slots", { ou: s => s.class_id === cls.id })).rows;
    } else {
      const slotsRes = await apiFetch(`${SUPABASE_URL}/rest/v1/class_schedule_slots?deleted=eq.false&class_id=eq.${cls.id}&select=id,day_of_week,start_time`);
      slots = slotsRes.ok ? await slotsRes.json() : [];
    }
    dashboardSlots = slots;
    // Le decoupage de la Terminale ne suit pas le calendrier commun : il vit en base.
    if (cls.grade === "TERMINALE" && !periodesTerminale.length) await loadPeriodDates().catch(() => {});
    const [actRes, cyclesRes, studentsRes, dispRes, testsRes] = await Promise.all([
      slots.length
        ? apiFetch(`${SUPABASE_URL}/rest/v1/period_activities?deleted=eq.false&slot_id=in.(${slots.map(s => s.id).join(",")})&select=*`)
        : Promise.resolve(null),
      modeHorsConnexion
        ? modeHorsConnexion.lire("cycles", { ou: c => c.class_id === cls.id })
            .then(r => ({ ok: true, json: async () => r.rows }))
        : apiFetch(`${SUPABASE_URL}/rest/v1/cycles?deleted=eq.false&class_id=eq.${cls.id}&select=*`),
      apiFetch(`${SUPABASE_URL}/rest/v1/students?deleted=eq.false&class_id=eq.${cls.id}&select=id,first_name,last_name`),
      apiFetch(`${SUPABASE_URL}/rest/v1/health_dispensations?class_id=eq.${cls.id}&select=*`),
      apiFetch(`${SUPABASE_URL}/rest/v1/eps_test_sessions?deleted=eq.false&class_id=eq.${cls.id}&select=*`)
    ]);
    dashboardActivities = actRes && actRes.ok ? await actRes.json() : [];
    dashboardCycles = cyclesRes.ok ? await cyclesRes.json() : [];
    dashboardStudents = studentsRes.ok ? await studentsRes.json() : [];
    dashboardDispenses = dispRes.ok ? await dispRes.json() : [];
    dashboardTests = testsRes.ok ? await testsRes.json() : [];

    // Le compteur de seances n'existe cote serveur que depuis schema_cycle_seance_en_cours.sql.
    // Tant qu'il n'est pas applique, on affiche la seance sans permettre de l'avancer : mieux
    // vaut un bouton grise et explique qu'un bouton qui echoue en silence.
    dashboardSeanceEnregistrable = dashboardCycles.length === 0
      || Object.prototype.hasOwnProperty.call(dashboardCycles[0], "current_session_number");

    dashboardEvaluations = [];
    if (dashboardCycles.length) {
      if (modeHorsConnexion) {
        const cycles = new Set(dashboardCycles.map(c => c.id));
        dashboardEvaluations = (await modeHorsConnexion.lire("evaluations", { ou: e => cycles.has(e.cycle_id) })).rows;
      } else {
        const evalRes = await apiFetch(`${SUPABASE_URL}/rest/v1/evaluations?deleted=eq.false&cycle_id=in.(${dashboardCycles.map(c => c.id).join(",")})&select=*`);
        dashboardEvaluations = evalRes.ok ? await evalRes.json() : [];
      }
    }
  } catch (e) {
    panel.innerHTML = `<div class="error">${planningText(e.message)}</div>`;
    return;
  }

  renderClassDashboard();
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fermerTableauDeBord() {
  classeOuverteId = null;
  document.getElementById("classDashboardPanel").style.display = "none";
  document.getElementById("classSchedulePanel").style.display = "none";
  document.querySelectorAll("#importsList .classePuce").forEach(b => b.classList.remove("active"));
}

/**
 * Le cycle qui porte la seance de cette periode.
 *
 * Meme regle que l'application : on cherche un cycle de la classe sur la meme APSA, en
 * preferant un cycle libre ; a defaut celui qui a ete cree depuis le planning pour cette
 * periode precise. Sans cette preference, un cycle d'evaluation ponctuelle prendrait la place
 * du cycle d'enseignement.
 */
function cyclePourPeriode(activity, periode) {
  if (!activity) {
    return dashboardCycles.find(c => c.priority_objective === `planning-period-${periode}`) || null;
  }
  const memeApsa = dashboardCycles.filter(c => memeActivite(c.apsa_name, activity.apsa_name));
  return memeApsa.find(c => !String(c.priority_objective || "").startsWith("planning-period-"))
    || memeApsa.find(c => c.priority_objective === `planning-period-${periode}`)
    || memeApsa[0] || null;
}

/**
 * Les activites de la periode, regroupees par jour de la semaine.
 *
 * Un niveau peut porter deux activites differentes dans la meme periode : natation le mercredi,
 * escalade le vendredi. Le tableau de bord n'en montrait qu'une, et enchainait les seances sur
 * tous les jours confondus - la seance du vendredi s'affichait donc en natation.
 *
 * Rend une entree par jour ayant une activite. Quand les deux jours portent la meme activite,
 * rend une seule entree portant les deux creneaux : c'est une continuite, un seul compteur.
 *
 * Les creneaux et activites sont des parametres, avec l'etat de l'ecran par defaut : c'est ce qui
 * rend la regle verifiable sans ouvrir une classe.
 */
function groupesDuJour(periode, creneaux = dashboardSlots, activites = dashboardActivities) {
  const parJour = new Map();
  for (const creneau of creneaux) {
    const jour = String(creneau.day_of_week || "").toUpperCase();
    if (!JOURS_SEMAINE.includes(jour)) continue;
    const activite = activites.find(a =>
      a.period_number === periode && a.slot_id === creneau.id);
    if (!activite || !String(activite.apsa_name || "").trim()) continue;
    if (!parJour.has(jour)) parJour.set(jour, { jour, activite, creneaux: [] });
    parJour.get(jour).creneaux.push(creneau);
  }
  const groupes = [...parJour.values()]
    .sort((a, b) => JOURS_SEMAINE.indexOf(a.jour) - JOURS_SEMAINE.indexOf(b.jour));

  // Meme activite partout : on n'a rien a separer. Les creneaux se rejoignent, le compteur reste
  // unique, et les seances s'enchainent d'un jour a l'autre comme avant.
  const nomsDistincts = new Set(groupes.map(g => texteNormaliseApsa(g.activite.apsa_name)));
  if (nomsDistincts.size <= 1) {
    return groupes.length
      ? [{ jour: null, activite: groupes[0].activite, creneaux: groupes.flatMap(g => g.creneaux) }]
      : [];
  }
  return groupes;
}

/** Le groupe a afficher : celui du jour s'il y a cours aujourd'hui, sinon le premier. */
function groupeAffiche(groupes) {
  if (!groupes.length) return null;
  if (dashboardJour) {
    const choisi = groupes.find(g => g.jour === dashboardJour);
    if (choisi) return choisi;
  }
  const aujourdhui = JOURS_SEMAINE[new Date().getDay()];
  return groupes.find(g => g.jour === aujourdhui) || groupes[0];
}

/**
 * Les onglets par jour, quand la periode porte deux activites differentes.
 *
 * Rien du tout quand il n'y en a qu'une : un seul onglet n'apprend rien et prend de la place.
 */
function ongletsJourHtml(groupes, choisi) {
  if (groupes.length < 2) return "";
  const aujourdhui = JOURS_SEMAINE[new Date().getDay()];
  return `<div class="dashJours">` + groupes.map(g => {
    const actif = choisi && g.jour === choisi.jour;
    const nom = (g.activite.apsa_name || "").trim();
    return `<button type="button" class="dashJour${actif ? " actif" : ""}" data-dash-jour="${g.jour}">
      <span class="dashJourIcone">${iconeApsa(nom)}</span>${planningText(libelleJour(g.jour))} · ${planningText(nom)}${
      g.jour === aujourdhui ? `<span class="dashJourAujourdhui">aujourd'hui</span>` : ""}
    </button>`;
  }).join("") + `</div>`;
}

/**
 * Un pictogramme par activite, dessine ici plutot que charge d'ailleurs.
 *
 * Une police d'icones venue d'Internet ne s'afficherait pas dans un gymnase sans reseau, ce qui
 * est precisement l'endroit ou cet ecran sert. Le trait est volontairement simple : la carte doit
 * se lire d'un coup d'oeil, pas s'admirer.
 */
function iconeApsa(nom) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${
    tracePourApsa(texteNormaliseApsa(nom))}</svg>`;
}

function tracePourApsa(cle) {
  const contient = (...mots) => mots.some(m => cle.includes(m));
  // Nageur : la tete, le bras qui sort de l'eau, et la ligne d'eau.
  if (contient("natation", "aquathlon", "sauvetage")) {
    return `<circle cx="8" cy="6" r="1.8"/><path d="M4 12l4-2 4 3 3-4 5 2"/>
            <path d="M2 17c2 0 2 1.5 4 1.5S8 17 10 17s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5"/>`;
  }
  // Escalade : la paroi et une prise.
  if (contient("escalade")) {
    return `<path d="M4 21V5l8-2v18"/><path d="M12 8l8 2v11h-8"/><circle cx="16" cy="14" r="1.2"/>`;
  }
  if (contient("course", "duree", "sprint", "relais", "athletisme", "500 m", "pentabond")) {
    return `<circle cx="15" cy="4.5" r="1.8"/><path d="M13 9l-3 4 3 3 1 5"/><path d="M10 13l-4 1"/><path d="M16 12l4 2"/>`;
  }
  if (contient("musculation", "renforcement")) {
    return `<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>`;
  }
  if (contient("danse")) {
    return `<circle cx="12" cy="4.5" r="1.8"/><path d="M12 8v6l-4 7M12 14l4 7M7 10l10-1"/>`;
  }
  if (contient("gymnastique", "acrosport", "cirque")) {
    return `<circle cx="12" cy="4.5" r="1.8"/><path d="M8 21l4-5 4 5M6 9h12M9 9l3 7 3-7"/>`;
  }
  if (contient("volley", "basket", "hand", "ultimate", "rugby", "football")) {
    return `<circle cx="12" cy="12" r="8"/><path d="M12 4c3 3 3 13 0 16M4.5 9.5c4 1.5 11 1.5 15 0"/>`;
  }
  if (contient("badminton", "tennis")) {
    return `<circle cx="8.5" cy="8.5" r="5"/><path d="M12 12l7 8"/><path d="M5 6l7 5M6.5 12l5-7"/>`;
  }
  if (contient("lutte")) {
    return `<circle cx="8" cy="5" r="1.6"/><circle cx="16" cy="5" r="1.6"/><path d="M8 8l3 4 5-4M6 21l3-6M18 21l-3-6"/>`;
  }
  if (contient("golf")) {
    return `<path d="M11 20V4l7 3-7 3"/><circle cx="8" cy="20" r="1.6"/>`;
  }
  // Sans correspondance : un chronometre, neutre et lisible.
  return `<circle cx="12" cy="13" r="7"/><path d="M12 9v4l2.5 1.5M10 2h4"/>`;
}

function libelleJour(jour) {
  const j = String(jour || "").toLowerCase();
  return j ? j.charAt(0).toUpperCase() + j.slice(1) : "";
}

/** Comparaison tolerante, comme memeActivite mais sur une seule chaine. */
function texteNormaliseApsa(nom) {
  return String(nom || "").toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Deux noms d'activite designent-ils la meme chose ?
 *
 * Le cycle est cree dans Cours, l'activite est posee dans Programmation : casse, accents et
 * ponctuation different sans que le professeur ait rien fait d'incoherent. Comparer les
 * chaines telles quelles faisait passer un cycle existant pour absent.
 */
function memeActivite(a, b) {
  const reduire = v => String(v || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  return reduire(a) !== "" && reduire(a) === reduire(b);
}

function dispensesEnCours() {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return dashboardDispenses.filter(d => d.start_date <= aujourdhui && d.end_date >= aujourdhui);
}

function renderClassDashboard() {
  const panel = document.getElementById("classDashboardPanel");
  const { row, label } = dashboardClass;
  const periodCount = planningPeriodCount(row.grade);
  if (dashboardPeriod > periodCount) dashboardPeriod = periodCount;

  const groupes = groupesDuJour(dashboardPeriod);
  const groupe = groupeAffiche(groupes);
  const activity = groupe ? groupe.activite
    : dashboardActivities.find(a => a.period_number === dashboardPeriod);
  // Les creneaux du groupe seul : sans cela les dates de seance melangeraient les deux jours.
  const creneauxDuGroupe = groupe ? groupe.creneaux : dashboardSlots;
  const cycle = cyclePourPeriode(activity, dashboardPeriod);
  const chips = [];
  for (let p = 1; p <= periodCount; p++) {
    chips.push(`<button class="periodChip${p === dashboardPeriod ? " active" : ""}" data-dash-period="${p}">Période ${p}</button>`);
  }

  const evalsPeriode = cycle ? dashboardEvaluations.filter(e => e.cycle_id === cycle.id) : [];
  const testsPeriode = dashboardTests.filter(t => (t.period_number || 1) === dashboardPeriod);
  const dispenses = dispensesEnCours();

  panel.innerHTML = `
    <div class="top dashEntete">
      <div class="dashIdentite">
        <div>
          <h2 style="margin:0">${planningText(label)}</h2>
          <div class="muted">${planningText(row.school_year || "")}</div>
        </div>
        <div class="dashActions">
          <button class="secondary" data-classe-action="schedule">Emploi du temps</button>
          <button class="secondary" data-classe-action="edit">Modifier la classe</button>
          <button class="danger" data-classe-action="delete">Supprimer</button>
        </div>
      </div>
      <button class="secondary" id="closeDashboardBtn" style="margin-top:0">Fermer</button>
    </div>

    <div class="periodBar" style="display:flex; margin-top:12px">${chips.join("")}</div>

    ${ongletsJourHtml(groupes, groupe)}

    <div class="card dashActivite">
      <div class="dashActiviteIcone">${iconeApsa(activity ? activity.apsa_name : "")}</div>
      <div>
        <div class="dashActiviteEyebrow">Période ${dashboardPeriod}${groupe && groupe.jour ? " · " + planningText(libelleJour(groupe.jour)) : ""}</div>
        <div class="dashActiviteNom">${activity ? planningText(activity.apsa_name) : "Aucune activité renseignée"}</div>
        <div class="dashActiviteLieu">${activity && activity.installation_name ? planningText(activity.installation_name) : "Installation non renseignée"}</div>
      </div>
    </div>

    ${carteSeanceHtml(cycle, creneauxDuGroupe)}

    <div id="dashExercises"></div>

    <div class="dashDuo">
      <button type="button" id="dashEvalPonctuelle" style="background:#FFE8D2">Évaluation<br>ponctuelle</button>
      <button type="button" id="dashEvalFinale" style="background:#EDE6FF">Évaluation<br>finale</button>
    </div>

    <button type="button" class="dashCarte" id="dashRecapBtn" style="background:#E8F1FF">
      <span class="dashPastille">📋</span>
      <span class="dashTexte">
        <span class="dashTitre">Récapitulatif Tests / Évaluations</span><br>
        <span class="dashSous">P${dashboardPeriod} · ${testsPeriode.length} test(s) · ${evalsPeriode.length} évaluation(s)</span>
      </span>
      <span class="dashFleche">›</span>
    </button>

    <button type="button" class="dashCarte" id="dashDispenseBtn" style="background:#E8F8F3">
      <span class="dashPastille">🩺</span>
      <span class="dashTexte">
        <span class="dashTitre">Dispenses</span><br>
        <span class="dashSous">${dispenses.length} élève(s) actuellement dispensé(s)</span>
      </span>
      <span class="dashFleche">›</span>
    </button>

    <div id="dashDetail"></div>`;

  document.getElementById("closeDashboardBtn").onclick = fermerTableauDeBord;
  panel.querySelectorAll("[data-dash-period]").forEach(b =>
    b.onclick = () => {
      dashboardPeriod = Number(b.dataset.dashPeriod);
      // Le jour choisi appartient a la periode qu'on quitte : le garder ferait afficher un jour
      // qui n'a pas d'activite dans la nouvelle. On repart de celui d'aujourd'hui.
      dashboardJour = null;
      dashboardSeanceManuelle = null;
      renderClassDashboard();
    });
  panel.querySelectorAll("[data-dash-jour]").forEach(b =>
    b.onclick = () => {
      dashboardJour = b.dataset.dashJour;
      // Chaque jour porte son propre cycle, donc son propre compteur : l'ecart saisi a la main
      // sur l'un n'a aucun sens sur l'autre.
      dashboardSeanceManuelle = null;
      renderClassDashboard();
    });

  panel.querySelector('[data-classe-action="schedule"]').onclick = () => openClassSchedule(row, label);
  panel.querySelector('[data-classe-action="edit"]').onclick = () => openEditImport(row);
  panel.querySelector('[data-classe-action="delete"]').onclick = () => deleteImport(row.id);

  document.getElementById("dashEvalPonctuelle").onclick = () => ouvrirEvaluationDepuisClasse(cycle, "PONCTUELLE");
  document.getElementById("dashEvalFinale").onclick = () => ouvrirEvaluationDepuisClasse(cycle, "FINALE");
  document.getElementById("dashRecapBtn").onclick = () => afficherRecapPeriode(evalsPeriode, testsPeriode);
  document.getElementById("dashDispenseBtn").onclick = () => afficherDispenses(dispenses);

  brancherCarteSeance(cycle);
  renderDashboardExercises(activity);
}

/**
 * La seance a afficher, et sa date.
 *
 * Le calendrier fait foi : la seance du jour se deduit du debut de periode et des creneaux de
 * la classe. Les boutons ne servent qu'a s'en ecarter ponctuellement, le temps de la visite.
 */
function seanceAffichee(cycle, creneaux) {
    const total = Math.max(1, Number(cycle.session_count) || 8);
    const dates = datesDesSeances(dashboardClass.row.grade, dashboardPeriod, creneaux || dashboardSlots, total);
    const duJour = seanceDuJour(dates);
    const numero = dashboardSeanceManuelle
        ?? duJour
        ?? Math.min(total, Math.max(1, Number(cycle.current_session_number) || 1));
    return { total, numero: Math.min(total, Math.max(1, numero)), dates, date: dates[numero - 1] || null, duJour };
}

/** La carte "Seance x/y", avec sa jauge et ses deux boutons ronds. */
function carteSeanceHtml(cycle, creneaux) {
  if (!cycle) {
    const activite = dashboardActivities.find(a => a.period_number === dashboardPeriod);
    return `<div class="card dashSeance" style="margin-top:8px">
      <div class="dashTitre">Aucun cycle pour cette période</div>
      <div class="dashSous">${activite
        ? "Le cycle n'existe pas encore : créez-le ici, il apparaîtra aussi dans COURS."
        : "Renseignez d'abord l'activité de la période dans PROGRAMMATION."}</div>
      ${activite ? `<button type="button" id="creerCycleBtn" style="margin-top:10px">Créer le cycle ${planningText(activite.apsa_name)}</button>` : ""}
    </div>`;
  }
  const { total, numero, date, dates } = seanceAffichee(cycle, creneaux);
  const avancement = Math.round((numero / total) * 100);
  const quand = date ? dateSeanceLisible(date)
    : (dates.length ? "" : "Posez les créneaux de la classe pour dater les séances");
  return `<div class="card dashSeance" style="margin-top:8px">
    <button type="button" id="ouvrirSeanceBtn" style="all:unset; cursor:pointer; display:block; width:100%">
      <div class="dashTitre">Séance ${numero}/${total}</div>
      <div class="dashSous">${planningText(cycle.apsa_name || "")}${quand ? " · " + planningText(quand) : ""}</div>
      <div class="dashSous" style="color:var(--primary); font-weight:600; margin-top:2px">Ouvrir la séance ›</div>
    </button>
    <div style="display:flex; align-items:center; gap:12px; margin-top:10px">
      <button type="button" class="dashRond" id="seanceMoins" ${numero <= 1 ? "disabled" : ""}>−</button>
      <div class="dashJauge"><div style="width:${avancement}%"></div></div>
      <button type="button" class="dashRond" id="seancePlus" ${numero >= total ? "disabled" : ""}>+</button>
    </div>
    ${dashboardSeanceEnregistrable ? "" :
      `<div class="muted" style="margin-top:8px">Compteur en lecture seule : appliquez schema_cycle_seance_en_cours.sql dans Supabase pour l'avancer depuis le site.</div>`}
  </div>`;
}

function brancherCarteSeance(cycle) {
  const creer = document.getElementById("creerCycleBtn");
  if (creer) creer.onclick = () => creerCyclePourPeriode();
  const ouvrir = document.getElementById("ouvrirSeanceBtn");
  if (ouvrir && cycle) ouvrir.onclick = () => ouvrirFicheSeance(cycle);
  const moins = document.getElementById("seanceMoins");
  const plus = document.getElementById("seancePlus");
  if (!moins || !plus) return;
  moins.onclick = () => changerSeance(cycle, -1);
  plus.onclick = () => changerSeance(cycle, 1);
}

/**
 * Avance ou recule la seance en cours.
 *
 * L'ecran est redessine avant l'envoi : le geste doit repondre tout de suite. En cas de refus
 * du serveur, on remet la valeur d'avant et on le dit - jamais l'inverse, sinon le compteur
 * afficherait une seance que l'application ne connaitrait pas.
 */
async function changerSeance(cycle, delta) {
  const { total, numero: avant } = seanceAffichee(cycle);
  const apres = Math.min(total, Math.max(1, avant + delta));
  if (apres === avant) return;

  dashboardSeanceManuelle = apres;
  cycle.current_session_number = apres;
  renderClassDashboard();
  // Le compteur reste en lecture seule tant que la colonne n'existe pas cote serveur :
  // l'ecran suit le geste, mais on n'envoie rien qui serait refuse.
  if (!dashboardSeanceEnregistrable) return;
  try {
    // La fiche entiere, et non le seul compteur : la fusion se fait champ par champ, et les
    // colonnes absentes passeraient pour des effacements volontaires.
    const maj = { ...cycle, current_session_number: apres, updated_at: new Date().toISOString() };
    if (modeHorsConnexion) await modeHorsConnexion.enregistrer("cycles", cycle.id, maj);
    else await apiFetch(`${SUPABASE_URL}/rest/v1/cycles?id=eq.${cycle.id}`, {
      method: "PATCH",
      body: JSON.stringify({ current_session_number: apres, updated_at: new Date().toISOString() })
    });
  } catch (e) {
    cycle.current_session_number = avant;
    renderClassDashboard();
    const detail = document.getElementById("dashDetail");
    if (detail) detail.innerHTML = `<div class="error">Séance non enregistrée : ${planningText(e.message)}</div>`;
  }
}

/**
 * Cree le cycle de la periode affichee, comme le fait l'application au moment d'ouvrir une
 * seance (CoursRepository.findOrCreatePlanningCycle) : meme classe, meme activite, huit
 * seances, et le marqueur de periode qui permettra de le retrouver.
 */
async function creerCyclePourPeriode() {
  const activite = dashboardActivities.find(a => a.period_number === dashboardPeriod);
  if (!activite) return;
  const bouton = document.getElementById("creerCycleBtn");
  if (bouton) { bouton.disabled = true; bouton.textContent = "Création..."; }
  // Construction dans le try : une session expiree faisait echouer la ligne suivante hors du
  // filet, et le bouton restait bloque sur "Création..." sans un mot.
  try {
    const nouveau = {
      id: crypto.randomUUID(), user_id: session.user_id, class_id: dashboardClass.row.id,
      grade: dashboardClass.row.grade, apsa_name: activite.apsa_name, session_count: 8,
      current_session_number: 1, priority_objective: `planning-period-${dashboardPeriod}`,
      installation: activite.installation_name || null,
      school_year: dashboardClass.row.school_year || "2026-2027",
      updated_at: new Date().toISOString(), deleted: false
    };
    if (modeHorsConnexion) await modeHorsConnexion.enregistrer("cycles", nouveau.id, nouveau);
    else await apiFetch(`${SUPABASE_URL}/rest/v1/cycles`, { method: "POST", body: JSON.stringify(nouveau) });
    dashboardCycles.push(nouveau);
    renderClassDashboard();
  } catch (e) {
    if (bouton) { bouton.disabled = false; bouton.textContent = "Créer le cycle"; }
    const detail = document.getElementById("dashDetail");
    if (detail) detail.innerHTML = `<div class="error">Cycle non créé : ${planningText(e.message)}</div>`;
  }
}

/**
 * Ouvre la fiche de la seance affichee.
 *
 * La fiche vit dans l'onglet COURS : on y bascule plutot que de la dupliquer, comme
 * l'application ouvre l'ecran de seance depuis la classe.
 */
async function ouvrirFicheSeance(cycle) {
  const { numero, total } = seanceAffichee(cycle);
  const contenu = await loadCycleContent(dashboardClass.row.grade, cycle.apsa_name);
  const ordonnees = orderedSessions(contenu, dashboardClass.row.grade, total);
  const ecrite = ordonnees[numero - 1];
  if (!ecrite) {
    const detail = document.getElementById("dashDetail");
    if (detail) detail.innerHTML = `<div class="muted" style="margin-top:10px">Aucune fiche rédigée pour la séance ${numero} en ${planningText(GRADE_LABELS[dashboardClass.row.grade] || dashboardClass.row.grade)} · ${planningText(cycle.apsa_name)}.</div>`;
    return;
  }
  sessionSheetContext = `${dashboardClass.label} · ${cycle.apsa_name}`;
  showTab("cours");
  showCoursTab("cours");
  showSessionSheet(contenu, ecrite, numero);
}

/** Les deux boutons d'evaluation menent au meme ecran que l'application, dans COURS. */
async function ouvrirEvaluationDepuisClasse(cycle, type) {
  const detail = document.getElementById("dashDetail");
  if (!detail) return;
  if (!cycle) {
    detail.innerHTML = `<div class="muted" style="margin-top:10px">Aucun cycle sur cette période : créez-le d'abord ci-dessus.</div>`;
    return;
  }
  detail.innerHTML = `<div class="muted" style="margin-top:10px">Chargement des grilles...</div>`;

  const [contenu, res] = await Promise.all([
    loadCycleContent(dashboardClass.row.grade, cycle.apsa_name),
    modeHorsConnexion
      ? modeHorsConnexion.lire("evaluations", { ou: e => e.cycle_id === cycle.id && e.type === type })
          .then(r => ({ ok: true, json: async () => r.rows }))
      : apiFetch(`${SUPABASE_URL}/rest/v1/evaluations?deleted=eq.false&cycle_id=eq.${cycle.id}&type=eq.${type}&select=*`)
  ]);
  const existantes = res.ok ? await res.json() : [];
  const modeles = modelesEvaluation(contenu, dashboardClass.row.grade, cycle.apsa_name)
    .filter(m => m.type === type);
  const libelle = type === "FINALE" ? "Évaluation finale" : "Évaluation ponctuelle";

  detail.innerHTML = `
    <div class="card" style="margin-top:10px">
      <div class="top"><h3 style="margin:0">${libelle} · ${planningText(cycle.apsa_name)}</h3>
        <button class="secondary" id="fermerDetail" style="margin-top:0">Fermer</button></div>
      ${existantes.length ? `<div class="muted" style="margin-top:8px">${existantes.length} grille(s) déjà créée(s) — ouvrez-les dans COURS.</div>` : ""}
      ${modeles.length ? modeles.map(m => `
        <div class="card" style="margin-top:8px">
          <strong>${planningText(m.titre)}</strong>
          <div class="muted" style="font-size:12px">${planningText(m.source)}</div>
          <ul class="tight" style="margin:8px 0 0; padding-left:18px">${
            m.criteres.map(c => `<li>${planningText(c.label)} <span class="muted">· ${c.max_points} pts</span></li>`).join("")}</ul>
          <button class="secondary" data-modele="${m.id}" style="margin-top:8px">Utiliser cette grille</button>
        </div>`).join("")
        : `<div class="muted" style="margin-top:8px">Aucune grille proposée pour ce niveau et cette activité. Créez-en une dans COURS.</div>`}
    </div>`;
  document.getElementById("fermerDetail").onclick = () => { detail.innerHTML = ""; };
  detail.querySelectorAll("[data-modele]").forEach(b =>
    b.onclick = () => utiliserModele(cycle, modeles.find(m => m.id === b.dataset.modele), b));
}

/**
 * Cree une grille a partir d'un modele.
 *
 * Le modele n'est qu'une proposition : ce qui est enregistre est une evaluation ordinaire,
 * avec ses criteres, que le professeur pourra modifier ou supprimer comme les autres.
 */
async function utiliserModele(cycle, modele, bouton) {
  if (!modele) return;
  bouton.disabled = true; bouton.textContent = "Création...";
  const id = crypto.randomUUID();
  const maintenant = new Date().toISOString();
  try {
    const grille = {
      id, user_id: session.user_id, cycle_id: cycle.id, type: modele.type,
      label: modele.titre, date_epoch_millis: Date.now(), updated_at: maintenant, deleted: false
    };
    const criteres = modele.criteres.map((c, i) => ({
      id: crypto.randomUUID(), user_id: session.user_id, evaluation_id: id,
      label: c.label, max_points: c.max_points, order_index: i,
      updated_at: maintenant, deleted: false
    }));
    if (modeHorsConnexion) {
      await modeHorsConnexion.enregistrer("evaluations", id, grille);
      for (const c of criteres) await modeHorsConnexion.enregistrer("evaluation_criteria", c.id, c);
    } else {
      await apiFetch(`${SUPABASE_URL}/rest/v1/evaluations`, { method: "POST", body: JSON.stringify(grille) });
      await apiFetch(`${SUPABASE_URL}/rest/v1/evaluation_criteria`, { method: "POST", body: JSON.stringify(criteres) });
    }
    showTab("cours");
    showCoursTab("cours");
    // La grille qu'on vient de creer, depliee. Et l'ecran amene dessus : la liste des cycles se
    // redessine au-dessus du panneau, triee par date de modification, si bien qu'on se croyait
    // renvoye sur une autre classe alors que la bonne grille etait plus bas.
    await openEvaluationPanel(cycle, { type: modele.type, id });
    document.getElementById("evaluationPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    bouton.disabled = false; bouton.textContent = "Utiliser cette grille";
    bouton.insertAdjacentHTML("afterend", `<div class="error">Grille non créée : ${planningText(e.message)}</div>`);
  }
}

function afficherRecapPeriode(evaluations, tests) {
  const hote = document.getElementById("dashDetail");
  if (!hote) return;
  if (!evaluations.length && !tests.length) {
    hote.innerHTML = `<div class="muted" style="margin-top:10px">Aucun test ni évaluation sur cette période.</div>`;
    return;
  }
  hote.innerHTML = `
    <div class="card" style="margin-top:10px">
      <div class="top"><h3 style="margin:0">Récapitulatif · P${dashboardPeriod}</h3>
        <button class="secondary" id="fermerDetail" style="margin-top:0">Fermer</button></div>
      ${tests.length ? `<h4 style="margin:12px 0 4px">Tests</h4><ul class="tight" style="margin:0; padding-left:18px">${
        tests.map(t => `<li>${planningText(t.test_name || "Test")}</li>`).join("")}</ul>` : ""}
      ${evaluations.length ? `<h4 style="margin:12px 0 4px">Évaluations</h4><ul class="tight" style="margin:0; padding-left:18px">${
        evaluations.map(e => `<li>${planningText(e.label || "Évaluation")} <span class="muted">· ${e.type === "FINALE" ? "finale" : "ponctuelle"}</span></li>`).join("")}</ul>` : ""}
    </div>`;
  document.getElementById("fermerDetail").onclick = () => { hote.innerHTML = ""; };
}

/**
 * Les dispenses en cours de la classe. La carte du tableau de bord n'en donnait que le
 * nombre : le bouton appelait une fonction qui n'existait pas, et ne faisait donc rien.
 */
function afficherDispenses(dispenses) {
  const hote = document.getElementById("dashDetail");
  if (!hote) return;
  if (!dispenses.length) {
    hote.innerHTML = `<div class="muted" style="margin-top:10px">Aucun élève dispensé aujourd'hui.</div>`;
    return;
  }
  const nom = id => {
    const e = dashboardStudents.find(s => s.id === id);
    return e ? `${planningText((e.last_name || "").toUpperCase())} ${planningText(e.first_name || "")}` : "Élève";
  };
  hote.innerHTML = `
    <div class="card" style="margin-top:10px">
      <div class="top"><h3 style="margin:0">Dispenses en cours</h3>
        <button class="secondary" id="fermerDetail" style="margin-top:0">Fermer</button></div>
      <ul class="tight" style="margin:10px 0 0; padding-left:18px">${
        dispenses.map(d => `<li>${nom(d.student_id)} <span class="muted">· du ${planningText(d.start_date)} au ${planningText(d.end_date)}</span></li>`).join("")}</ul>
    </div>`;
  document.getElementById("fermerDetail").onclick = () => { hote.innerHTML = ""; };
}

/**
 * Exercices rapides de l'activite de la periode. Le catalogue vit dans quick-exercises.js ;
 * s'il n'est pas charge, la carte disparait plutot que de casser le tableau de bord.
 */
function renderDashboardExercises(activity) {
  const host = document.getElementById("dashExercises");
  if (!host) return;
  if (!activity || typeof QuickExercises === "undefined") { host.innerHTML = ""; return; }

  const all = QuickExercises.forActivity(activity.apsa_name, dashboardClass.row.grade);
  const list = all.filter(e => e.type === dashboardExerciseType);

  // Une carte repliee, comme dans l'application : deplie, le catalogue occupait tout l'ecran
  // et repoussait les evaluations et le recapitulatif hors de vue.
  host.innerHTML = `
    <details class="card" style="background:#E5F7E9; border:0; margin-top:8px">
    <summary style="cursor:pointer; font-weight:700; color:#102F4A; list-style:none">
      Fiches Exercices / Jeux <span class="muted" style="font-weight:400">— ${planningText(activity.apsa_name)}</span>
    </summary>
    <div class="subtabbar" style="margin-top:10px">
      <button class="subtabbtn${dashboardExerciseType === "WARMUP" ? " active" : ""}" data-ex-type="WARMUP">Echauffement</button>
      <button class="subtabbtn${dashboardExerciseType === "GAME" ? " active" : ""}" data-ex-type="GAME">Exercice / Jeu</button>
    </div>
    ${list.map((e, i) => `
      <details class="card" style="margin-top:8px">
        <summary style="cursor:pointer"><strong>${e.title}</strong> <span class="muted">· ${e.durationMinutes} min</span></summary>
        <div class="muted" style="margin-top:6px">${e.material}</div>
        <canvas data-diagram="${e.diagramKind}" width="520" height="240" style="width:100%; max-width:520px; margin-top:10px; border:1px solid var(--border); border-radius:10px; background:#fff"></canvas>
        <div style="margin-top:10px">${e.organization}</div>
        <div style="margin-top:8px"><strong>Consignes</strong><div>${e.instructions}</div></div>
        ${e.steps && e.steps.length ? `<div style="margin-top:8px"><strong>Deroulement</strong><ul class="tight" style="margin:2px 0 0; padding-left:18px">${e.steps.map(s => `<li>${s}</li>`).join("")}</ul></div>` : ""}
        <div style="margin-top:8px"><strong>Reussite</strong><div>${e.successCriteria}</div></div>
        <div class="muted" style="margin-top:8px">Plus facile — ${e.easier}</div>
        <div class="muted">Plus difficile — ${e.harder}</div>
        ${e.safety ? `<div style="margin-top:8px; padding:8px 10px; border-left:3px solid var(--danger); background:#FDEEED; border-radius:0 4px 4px 0"><strong style="color:var(--danger)">Securite</strong><div>${e.safety}</div></div>` : ""}
      </details>`).join("")}
    </details>`;

  host.querySelectorAll("[data-ex-type]").forEach(b =>
    b.onclick = () => { dashboardExerciseType = b.dataset.exType; renderDashboardExercises(activity); });

  // Les schemas ne se dessinent qu'a l'ouverture du detail : inutile de peindre 10 canvas.
  host.querySelectorAll("details").forEach(d => d.addEventListener("toggle", () => {
    if (!d.open) return;
    const canvas = d.querySelector("canvas[data-diagram]");
    if (canvas && !canvas.dataset.drawn) {
      QuickExercises.drawDiagram(canvas, canvas.dataset.diagram);
      canvas.dataset.drawn = "1";
    }
  }));
}

// ---- Emploi du temps d'une classe (miroir de ClassScheduleScreen.kt) ----
// Les jours ou la classe a EPS chaque semaine : c'est ce qui permet de calculer la duree
// et les dates d'un cycle. Les creneaux sont les memes que ceux du Planning.

let scheduleClass = null;

async function openClassSchedule(cls, label) {
  scheduleClass = { row: cls, label };
  document.getElementById("editImportPanel").style.display = "none";
  const panel = document.getElementById("classSchedulePanel");
  panel.style.display = "block";
  panel.innerHTML = '<div class="muted">Chargement de l\'emploi du temps...</div>';
  await renderClassSchedule();
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function renderClassSchedule() {
  const panel = document.getElementById("classSchedulePanel");
  const { row, label } = scheduleClass;

  let brut;
  if (modeHorsConnexion) {
    brut = (await modeHorsConnexion.lire("class_schedule_slots", { ou: s => s.class_id === row.id })).rows;
  } else {
    const res = await apiFetch(`${SUPABASE_URL}/rest/v1/class_schedule_slots?deleted=eq.false&class_id=eq.${row.id}&select=*`);
    brut = res.ok ? await res.json() : [];
  }
  const slots = brut
    .sort((a, b) => {
      const d = PLANNING_DAYS.findIndex(x => x.key === a.day_of_week) - PLANNING_DAYS.findIndex(x => x.key === b.day_of_week);
      return d !== 0 ? d : slotStartMinutes(a) - slotStartMinutes(b);
    });

  const rows = slots.length === 0
    ? '<div class="muted">Aucun creneau. Ajoutez-en un ci-dessous.</div>'
    : slots.map(s => {
        const day = PLANNING_DAYS.find(d => d.key === s.day_of_week);
        const dayLabel = day ? day.key.charAt(0) + day.key.slice(1).toLowerCase() : s.day_of_week;
        const detail = [s.start_time, `${s.duration_minutes} min`, s.installation_name].filter(Boolean).join(" · ");
        return `<div class="top" style="padding:9px 0; border-bottom:1px solid var(--border)">
          <div><strong>${dayLabel}</strong><div class="muted">${detail}</div></div>
          <button class="danger" data-remove-slot="${s.id}" style="margin-top:0">Supprimer</button>
        </div>`;
      }).join("");

  panel.innerHTML = `
    <div class="top">
      <div>
        <h2 style="margin:0">Emploi du temps · ${label}</h2>
        <div class="muted">Jours ou la classe a EPS chaque semaine. Sert a calculer la duree et les dates d'un cycle.</div>
      </div>
      <button class="secondary" id="closeScheduleBtn" style="margin-top:0">Fermer</button>
    </div>
    <div style="margin-top:12px">${rows}</div>
    <h2 style="margin:18px 0 0; font-size:15px">Nouveau creneau EPS</h2>
    <div class="row">
      <div>
        <label for="slotDay">Jour</label>
        <select id="slotDay">${PLANNING_DAYS.map(d =>
          `<option value="${d.key}">${d.key.charAt(0) + d.key.slice(1).toLowerCase()}</option>`).join("")}</select>
      </div>
      <div>
        <label for="slotStart">Heure de debut</label>
        <input type="time" id="slotStart" value="08:00">
      </div>
      <div>
        <label for="slotDuration">Duree</label>
        <select id="slotDuration">${PLANNING_DURATIONS.map(([m, l]) =>
          `<option value="${m}"${m === 60 ? " selected" : ""}>${l}</option>`).join("")}</select>
      </div>
    </div>
    <button id="addSlotBtn">Ajouter le creneau</button>
    <div class="error" id="slotError"></div>`;

  document.getElementById("closeScheduleBtn").onclick = () => { panel.style.display = "none"; };
  panel.querySelectorAll("[data-remove-slot]").forEach(b =>
    b.onclick = () => removeClassScheduleSlot(b.dataset.removeSlot));
  document.getElementById("addSlotBtn").onclick = addClassScheduleSlot;
}

async function addClassScheduleSlot() {
  const errorEl = document.getElementById("slotError");
  errorEl.textContent = "";
  const day = document.getElementById("slotDay").value;
  const start = document.getElementById("slotStart").value;
  const duration = parseInt(document.getElementById("slotDuration").value, 10);
  if (!start) { errorEl.textContent = "Indiquez une heure de debut."; return; }
  try {
    const cls = scheduleClass.row;
    await apiFetch(`${SUPABASE_URL}/rest/v1/class_schedule_slots`, {
      method: "POST",
      body: JSON.stringify({
        id: crypto.randomUUID(), user_id: session.user_id, class_id: cls.id,
        day_of_week: day, start_time: start, duration_minutes: duration,
        installation_name: null, class_label: scheduleClass.label,
        teacher_label: session.email || "?",
        updated_at: new Date().toISOString(), deleted: false
      })
    });
    await renderClassSchedule();
  } catch (e) {
    errorEl.textContent = e.message;
  }
}

async function removeClassScheduleSlot(slotId) {
  await apiFetch(`${SUPABASE_URL}/rest/v1/class_schedule_slots?id=eq.${slotId}`, {
    method: "PATCH",
    body: JSON.stringify({ deleted: true, updated_at: new Date().toISOString() })
  });
  await renderClassSchedule();
}

async function refreshCoursClassOptions() {
  const select = document.getElementById("coursClass");
  try {
    const res = await apiFetch(`${SUPABASE_URL}/rest/v1/classes?deleted=eq.false&select=*&order=name.asc`);
    const rows = res.ok ? await res.json() : [];
    select.innerHTML = rows.length
      ? rows.map(r => `<option value="${r.id}" data-grade="${r.grade}">${planningText(planningClassLabel(r))}</option>`).join("")
      : '<option value="">Aucune classe enregistree</option>';
    refreshCoursApsaOptions();
  } catch (e) {
    select.innerHTML = '<option value="">Aucune classe enregistree</option>';
  }
}

function refreshCoursApsaOptions() {
  const select = document.getElementById("coursClass");
  const grade = select.selectedOptions[0]?.dataset.grade;
  document.getElementById("coursApsa").innerHTML = grade ? apsaOptionsHtml(grade) : "";
}

function initCoursTab() {
  if (!coursTabReady) {
    ["cycleGrade", "cycleApsa", "cycleSessions"].forEach(id =>
      document.getElementById(id).addEventListener("change", () => {
        if (id === "cycleGrade") document.getElementById("cycleApsa").innerHTML = apsaOptionsHtml(document.getElementById("cycleGrade").value);
        renderCyclePreview();
      }));
    document.getElementById("coursClass").addEventListener("change", refreshCoursApsaOptions);
    document.getElementById("createCoursBtn").addEventListener("click", createCours);
    document.getElementById("coursSubtabs").addEventListener("click", e => {
      const btn = e.target.closest(".subtabbtn");
      if (btn) showCoursTab(btn.dataset.courstab);
    });
    document.getElementById("coursPeriodBar").addEventListener("click", e => {
      const button = e.target.closest("[data-cours-period]");
      if (!button) return;
      selectedCoursPeriod = parseInt(button.dataset.coursPeriod, 10);
      document.querySelectorAll("[data-cours-period]").forEach(b => b.classList.toggle("active", b === button));
      renderCreatedCourses();
    });
    coursTabReady = true;
  }
  document.getElementById("cycleApsa").innerHTML = apsaOptionsHtml(document.getElementById("cycleGrade").value);
  showCoursTab("cycles");
}

async function createCours() {
  const errorEl = document.getElementById("coursError");
  errorEl.textContent = "";
  const classSelect = document.getElementById("coursClass");
  const classId = classSelect.value;
  const grade = classSelect.selectedOptions[0]?.dataset.grade;
  const apsa = document.getElementById("coursApsa").value;
  const sessions = parseInt(document.getElementById("coursSessions").value, 10);
  if (!classId || !grade) { errorEl.textContent = "Creez d'abord une classe dans l'onglet Classes."; return; }
  if (!apsa) { errorEl.textContent = "Choisissez une activite."; return; }
  try {
    const nouveau = {
      id: crypto.randomUUID(), user_id: session.user_id, class_id: classId,
      grade, apsa_name: apsa, session_count: sessions, current_session_number: 1,
      school_year: document.getElementById("schoolYear").value || "2026-2027",
      updated_at: new Date().toISOString(), deleted: false
    };
    if (modeHorsConnexion) {
      await modeHorsConnexion.enregistrer("cycles", nouveau.id, nouveau);
    } else {
      const res = await apiFetch(`${SUPABASE_URL}/rest/v1/cycles`, { method: "POST", body: JSON.stringify(nouveau) });
      if (!res.ok) throw new Error("Echec de creation du cours.");
    }
    showCoursTab("cours");
  } catch (e) {
    errorEl.textContent = e.message;
  }
}

async function loadCycles() {
  const listEl = document.getElementById("cyclesList");
  listEl.innerHTML = '<div class="muted">Chargement...</div>';
  try {
    const lireLocal = (table, options) => modeHorsConnexion.lire(table, options)
      .then(r => ({ ok: true, json: async () => r.rows }));
    const [res, classesRes, slotsRes, activitiesRes] = await Promise.all(modeHorsConnexion
      ? [
          lireLocal("cycles", { trier: (a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")) }),
          lireLocal("classes"), lireLocal("class_schedule_slots"), lireLocal("period_activities")
        ]
      : [
          apiFetch(`${SUPABASE_URL}/rest/v1/cycles?deleted=eq.false&select=*&order=updated_at.desc`),
          apiFetch(`${SUPABASE_URL}/rest/v1/classes?deleted=eq.false&select=*`),
          apiFetch(`${SUPABASE_URL}/rest/v1/class_schedule_slots?deleted=eq.false&select=id,class_id`),
          apiFetch(`${SUPABASE_URL}/rest/v1/period_activities?deleted=eq.false&select=slot_id,period_number,apsa_name`)
        ]);
    const rows = await res.json();
    if (!res.ok) throw new Error("Impossible de charger les cycles.");
    const classes = classesRes.ok ? await classesRes.json() : [];
    const slots = slotsRes.ok ? await slotsRes.json() : [];
    const activities = activitiesRes.ok ? await activitiesRes.json() : [];
    const classById = Object.fromEntries(classes.map(c => [c.id, c]));
    const classBySlot = Object.fromEntries(slots.map(s => [s.id, s.class_id]));
    const normalizeApsa = value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    loadedCourses = rows.map(course => {
      const periods = activities
        .filter(a => classBySlot[a.slot_id] === course.class_id && normalizeApsa(a.apsa_name) === normalizeApsa(course.apsa_name))
        .map(a => Number(a.period_number)).filter(p => p >= 1 && p <= 5);
      return { ...course, period_number: periods[0] || null, classRow: classById[course.class_id] || null };
    });
    renderCreatedCourses();
  } catch (e) {
    listEl.innerHTML = `<div class="error">${e.message}</div>`;
  }
}

function renderCreatedCourses() {
  const listEl = document.getElementById("cyclesList");
  const rows = loadedCourses.filter(r => r.period_number === selectedCoursPeriod);
  document.getElementById("createdCoursePanel").style.display = "none";
  document.getElementById("evaluationPanel").style.display = "none";
  if (rows.length === 0) {
    listEl.innerHTML = `<div class="card muted">Aucun cours créé en période ${selectedCoursPeriod}.</div>`;
    return;
  }
  listEl.innerHTML = "";
  rows.forEach(r => {
      const div = document.createElement("div");
      div.className = "card";
      const classLabel = r.classRow ? planningText(planningClassLabel(r.classRow)) : "Classe";
      div.innerHTML = `
        <div class="top">
          <div><strong>${classLabel}</strong> · ${r.apsa_name} · ${r.session_count} séances</div>
          <div>
            <button data-action="open" style="margin-top:0">Ouvrir</button>
            <button class="secondary" data-action="evaluations" style="margin-top:0" ${r.class_id ? "" : "disabled title='Aucune classe rattachee'"}>Evaluations</button>
            <button class="danger" data-action="delete" style="margin-top:0">Supprimer</button>
          </div>
        </div>
        <div class="muted" style="margin-top:6px">${programmeFor(r.grade, r.school_year)}</div>`;
      div.querySelector('[data-action="open"]').addEventListener("click", () => openCreatedCourse(r, classLabel));
      div.querySelector('[data-action="delete"]').addEventListener("click", () => deleteCycle(r.id));
      const evalBtn = div.querySelector('[data-action="evaluations"]');
      if (r.class_id) evalBtn.addEventListener("click", () => openEvaluationPanel(r));
      listEl.appendChild(div);
    });
}

async function openCreatedCourse(course, classLabel) {
  const panel = document.getElementById("createdCoursePanel");
  panel.className = "card";
  panel.style.display = "block";
  panel.innerHTML = '<div class="muted">Chargement du cours...</div>';
  const content = await loadCycleContent(course.grade, course.apsa_name);
  const ordered = orderedSessions(content, course.grade, course.session_count);
  let sessionsHtml = "";
  for (let i = 1; i <= course.session_count; i++) {
    const written = ordered[i - 1];
    const title = written?.theme || content?.plannedTitles?.[i - 1] || `Séance ${i}`;
    sessionsHtml += `<button class="secondary createdSessionBtn" data-session="${i}" style="display:block;width:100%;text-align:left">S${i} · ${title}</button>`;
  }
  panel.innerHTML = `<div class="top"><div><h2 style="margin:0">${classLabel} · ${course.apsa_name}</h2><div class="muted">Période ${selectedCoursPeriod} · ${course.session_count} séances</div></div><button class="secondary" id="closeCreatedCourse" style="margin-top:0">Fermer</button></div>${sessionsHtml}`;
  document.getElementById("closeCreatedCourse").onclick = () => { panel.style.display = "none"; };
  panel.querySelectorAll("[data-session]").forEach(button => button.onclick = () => {
    const n = Number(button.dataset.session);
    const written = ordered[n - 1];
    sessionSheetContext = `${classLabel} · ${course.apsa_name}`;
    if (written) { showSessionSheet(content, written, n); return; }
    // Le titre d'une seance peut venir du programme sans qu'une fiche existe pour ce niveau.
    // Le clic ne faisait alors rien : mieux vaut le dire que de laisser croire a une panne.
    const sheet = document.getElementById("sessionSheet");
    sheet.style.display = "block";
    sheet.innerHTML = `<div class="top"><h2 style="margin:0">S${n}</h2>
      <button class="secondary" id="closeSheetBtn" style="margin-top:0">Fermer</button></div>
      <div class="muted" style="margin-top:8px">Aucune fiche rédigée pour cette séance en
      ${planningText(GRADE_LABELS[course.grade] || course.grade)} · ${planningText(course.apsa_name)}.</div>`;
    document.getElementById("closeSheetBtn").onclick = () => { sheet.style.display = "none"; };
    sheet.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteCycle(id) {
  if (modeHorsConnexion) await modeHorsConnexion.supprimer("cycles", id);
  else await apiFetch(`${SUPABASE_URL}/rest/v1/cycles?id=eq.${id}`, {
    method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: new Date().toISOString() })
  });
  loadCycles();
}
