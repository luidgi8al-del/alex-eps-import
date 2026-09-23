/*
 * Socle commun des outils.
 *
 * Les outils se sont ecrits par vagues successives, chacune avec ses habitudes : ceux de
 * cours.js n'ont aucun choix de classe, ceux d'outils.js en ont un (toolRosterHtml), ceux de
 * tools-workspace.js en ont un autre (contextHtml + periode), et seuls les trois derniers
 * (condition physique, observation natation, observation gymnastique) ont le tableau grand
 * ecran. D'un outil a l'autre, le meme geste ne se faisait donc pas au meme endroit.
 *
 * Ce fichier rassemble ce que tout outil doit savoir faire, une fois pour toutes :
 *   - choisir une classe ou travailler sans classe, avec sa periode ;
 *   - noter en chiffres ou en couleurs (vert + / vert / orange / rouge), la couleur etant
 *     proposee d'office en 6e ;
 *   - constituer des groupes, les modifier, les vider ;
 *   - afficher un tableau dont la colonne des noms reste fixe pendant que les criteres defilent ;
 *   - remettre une saisie a zero sans quitter l'outil.
 *
 * Script classique, comme le reste du site : les fonctions sont posees sur globalThis a la fin.
 */
(function () {
  "use strict";

  const esc = v => String(v ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---- Notation en couleurs ----------------------------------------------------------------
  // Quatre niveaux, du plus reussi au plus fragile. Les memes partout : une pastille verte doit
  // vouloir dire la meme chose en natation, en gymnastique et sur un test de course.
  const SOCLE_COULEURS = [
    { code: "vert-plus", libelle: "Vert +", aide: "Objectif atteint", couleur: "#0F7B3F", part: 1 },
    { code: "vert", libelle: "Vert", aide: "Presque atteint", couleur: "#3FA96B", part: 0.75 },
    { code: "orange", libelle: "Orange", aide: "En cours", couleur: "#E08A2B", part: 0.5 },
    { code: "rouge", libelle: "Rouge", aide: "Non atteint", couleur: "#C0392B", part: 0.25 }
  ];
  const socleCouleurParCode = code => SOCLE_COULEURS.find(n => n.code === code) || null;

  /** Le mode propose d'office : couleur en 6e, note ensuite. Modifiable dans tous les cas. */
  function socleModeParDefaut(classId) {
    const cls = (globalThis.toolClasses || []).find(c => String(c.id) === String(classId));
    return cls && cls.grade === "SIXIEME" ? "couleur" : "note";
  }

  /** Le selecteur note / couleur, identique d'un outil a l'autre. */
  function socleSelecteurModeHtml(mode, id = "socleMode") {
    return `<label>Notation<select id="${id}">
      <option value="note"${mode === "note" ? " selected" : ""}>Note chiffrée</option>
      <option value="couleur"${mode === "couleur" ? " selected" : ""}>Couleur (Vert + · Vert · Orange · Rouge)</option>
    </select></label>`;
  }

  /** Une pastille de couleur cliquable, qui passe au niveau suivant a chaque appui. */
  function socleCouleurCelluleHtml(code, attributs = "") {
    const niveau = socleCouleurParCode(code);
    return `<button type="button" class="socle-dot${niveau ? " rempli" : ""}" ${attributs}
      style="${niveau ? `background:${niveau.couleur};border-color:${niveau.couleur}` : ""}"
      title="${niveau ? esc(niveau.libelle + " · " + niveau.aide) : "Non évalué"}">${niveau ? "" : "+"}</button>`;
  }

  /** Niveau suivant dans le cycle : rien → vert + → vert → orange → rouge → rien. */
  function socleCouleurSuivante(code) {
    const i = SOCLE_COULEURS.findIndex(n => n.code === code);
    return i < 0 ? SOCLE_COULEURS[0].code : (i + 1 < SOCLE_COULEURS.length ? SOCLE_COULEURS[i + 1].code : null);
  }

  // ---- Contexte : classe, periode, organisation ---------------------------------------------

  /**
   * Le bandeau de contexte commun. `options` : { classId, period, groups, prefixe }.
   * `groups` a false masque le choix d'organisation, pour les outils qui n'en ont pas besoin.
   */
  function socleContexteHtml(options = {}) {
    const p = options.prefixe || "socle";
    const classId = options.classId || "";
    const periodes = socleNombrePeriodes(classId);
    return `<section class="field-tool-card socle-contexte">
      <div class="tool-context">
        <select id="${p}Class">
          <option value=""${!classId ? " selected" : ""}>Usage libre (sans classe)</option>
          ${(globalThis.toolClasses || []).map(c =>
            `<option value="${esc(c.id)}"${String(c.id) === String(classId) ? " selected" : ""}>${esc(c.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field-tool-row">
        <label>Période<select id="${p}Period">${periodes.map(n =>
          `<option value="${n}"${n === (+options.period || 1) ? " selected" : ""}>Période ${n}</option>`).join("")}</select></label>
        ${options.groups === false ? "" : `<label>Organisation<select id="${p}Grouping">
          <option value="groups"${options.groupsEnabled ? " selected" : ""}>Constituer des groupes</option>
          <option value="alpha"${options.groupsEnabled ? "" : " selected"}>Ordre alphabétique</option>
        </select></label>`}
        ${options.mode ? socleSelecteurModeHtml(options.mode, `${p}Mode`) : ""}
      </div>
    </section>`;
  }

  /** Le nombre de periodes de la classe : une 6e n'en a pas forcement autant qu'une terminale. */
  function socleNombrePeriodes(classId) {
    const cls = (globalThis.toolClasses || []).find(c => String(c.id) === String(classId));
    const n = cls && typeof globalThis.planningPeriodCount === "function"
      ? globalThis.planningPeriodCount(cls.grade) : 5;
    return Array.from({ length: n || 5 }, (_, i) => i + 1);
  }

  /**
   * Branche le bandeau. `etat` est modifie sur place (classId, period, groupsEnabled, mode),
   * puis `apresChangement` est rappele - une seule fois par changement, les eleves deja charges.
   */
  function socleBrancherContexte(etat, apresChangement, prefixe = "socle") {
    const cls = document.getElementById(`${prefixe}Class`);
    if (cls) cls.onchange = async () => {
      etat.classId = cls.value || "";
      globalThis.toolClassId = etat.classId || globalThis.FREE_USE;
      await globalThis.loadToolStudents(etat.classId);
      // La couleur s'impose d'office en 6e tant que l'enseignant n'a pas choisi lui-meme.
      if (etat.mode !== undefined && !etat.modeChoisi) etat.mode = socleModeParDefaut(etat.classId);
      apresChangement?.();
    };
    const per = document.getElementById(`${prefixe}Period`);
    if (per) per.onchange = () => { etat.period = +per.value || 1; apresChangement?.(); };
    const grp = document.getElementById(`${prefixe}Grouping`);
    if (grp) grp.onchange = () => { etat.groupsEnabled = grp.value === "groups"; apresChangement?.(); };
    const mode = document.getElementById(`${prefixe}Mode`);
    if (mode) mode.onchange = () => { etat.mode = mode.value; etat.modeChoisi = true; apresChangement?.(); };
  }

  // ---- Tableau grand ecran ------------------------------------------------------------------

  /**
   * Le tableau que tous les outils d'evaluation partagent : la colonne des noms reste visible
   * pendant que les criteres defilent horizontalement, l'en-tete reste visible en defilant vers
   * le bas. C'est ce qui permet d'evaluer une classe entiere sans perdre de vue qui l'on note.
   *
   * `colonnes` : [{ titre, aide }]. `lignes` : [{ eleve, cellules:[html], total }].
   */
  function socleTableauHtml(colonnes, lignes, titreTotal = "Note") {
    return `<div class="fitness-table-wrap"><table>
      <thead><tr><th>Nom et prénom</th>${colonnes.map(c =>
        `<th>${esc(c.titre)}${c.aide ? `<br><small>${esc(c.aide)}</small>` : ""}</th>`).join("")}
        ${titreTotal ? `<th>${esc(titreTotal)}</th>` : ""}</tr></thead>
      <tbody>${lignes.map(l => `<tr>
        <td><strong>${esc((l.eleve.last_name || "").toUpperCase())} ${esc(l.eleve.first_name || "")}</strong>
          ${l.sousTitre ? `<small>${esc(l.sousTitre)}</small>` : ""}</td>
        ${l.cellules.map(c => `<td>${c}</td>`).join("")}
        ${titreTotal ? `<td class="fitness-score${l.total == null ? " incomplete" : ""}">${l.total == null ? "—" : l.total}</td>` : ""}
      </tr>`).join("")}</tbody></table></div>`;
  }

  // ---- Barre d'actions ----------------------------------------------------------------------

  /**
   * La barre du bas, toujours au meme endroit et dans le meme ordre. "Réinitialiser" en fait
   * partie : une saisie d'essai, ou une classe reprise a zero, ne doit pas obliger a fermer
   * l'outil et le rouvrir.
   */
  function socleActionsHtml(options = {}) {
    const p = options.prefixe || "socle";
    return `<div class="fitness-actions">
      <button id="${p}Save">💾 ${options.libelleSave || "Enregistrer"}</button>
      ${options.excel === false ? "" : `<button class="secondary" id="${p}Excel">▦ Excel</button>`}
      ${options.pdf === false ? "" : `<button class="secondary" id="${p}Pdf">▤ PDF</button>`}
      <button class="secondary" id="${p}Reset">↺ Réinitialiser</button>
      ${options.retour === false ? "" : `<button class="secondary" id="${p}Back">← Retour</button>`}
    </div><div class="ok" id="${p}Msg"></div>`;
  }

  /** Branche la barre. `onReset` n'est appele qu'apres confirmation : on efface une saisie. */
  function socleBrancherActions(handlers = {}, prefixe = "socle") {
    const lier = (suffixe, fn) => { const b = document.getElementById(prefixe + suffixe); if (b && fn) b.onclick = fn; };
    lier("Save", handlers.onSave);
    lier("Excel", handlers.onExcel);
    lier("Pdf", handlers.onPdf);
    lier("Back", handlers.onBack);
    lier("Reset", () => {
      if (!confirm(handlers.messageReset || "Effacer toutes les saisies de cet outil et repartir de zéro ?")) return;
      handlers.onReset?.();
    });
  }

  // ---- Groupes ------------------------------------------------------------------------------

  /**
   * Les groupes vivent dans l'etat de l'outil, sous la forme { idEleve: numeroDeGroupe }.
   * Repartition automatique par paquets de `taille`, dans l'ordre de la liste : c'est ce qu'on
   * fait sur le terrain quand on compte "un, deux, un, deux".
   */
  function socleRepartirGroupes(eleves, taille) {
    const affectations = {};
    eleves.forEach((s, i) => { affectations[s.id] = Math.floor(i / Math.max(1, taille)) + 1; });
    return affectations;
  }

  /** Les numeros de groupe utilises, dans l'ordre. */
  function socleGroupes(affectations) {
    return [...new Set(Object.values(affectations || {}).map(n => +n || 0).filter(n => n > 0))].sort((a, b) => a - b);
  }

  /** Les onglets de groupe : "Tous" puis un par groupe, comme dans Arrêt course. */
  function socleOngletsGroupesHtml(affectations, actif, prefixe = "socle") {
    const gs = socleGroupes(affectations);
    if (!gs.length) return "";
    return `<div class="fitness-tabs">
      <button data-${prefixe}-group="0" class="${actif ? "" : "active"}">Tous</button>
      ${gs.map(g => `<button data-${prefixe}-group="${g}" class="${g === actif ? "active" : ""}">Groupe ${g}</button>`).join("")}
      <button id="${prefixe}EditGroups" class="secondary">Modifier les groupes</button>
    </div>`;
  }

  Object.assign(globalThis, {
    SOCLE_COULEURS, socleCouleurParCode, socleModeParDefaut, socleSelecteurModeHtml,
    socleCouleurCelluleHtml, socleCouleurSuivante, socleContexteHtml, socleNombrePeriodes,
    socleBrancherContexte, socleTableauHtml, socleActionsHtml, socleBrancherActions,
    socleRepartirGroupes, socleGroupes, socleOngletsGroupesHtml
  });
})();
