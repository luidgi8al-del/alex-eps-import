/*
 * Referentiel BAC : les fiches certificatives du lycee.
 *
 * "Ouvrir" pointait sur le fichier Word. Aucun navigateur ne sait afficher un .docx : le bouton
 * ne faisait donc rien de visible, ou lancait un telechargement silencieux - on croyait le lien
 * casse. Chaque fiche existe desormais aussi en PDF, a cote de son Word : le PDF s'ouvre dans
 * l'onglet, le Word reste disponible pour qui veut modifier la fiche.
 *
 * Les PDF sont produits a partir des .docx. En cas de mise a jour d'une fiche Word, regenerer le
 * PDF du meme nom, sinon les deux divergent en silence.
 */
(function () {
  const docs = [
    ['3 × 500 m', 'Fiche certificative', '3x500', '📈'],
    ['Acrosport', 'Fiche certificative', 'acrosport', '🤸'],
    ['Badminton', 'Fiche certificative', 'badminton', '🏸'],
    ['Course en durée', 'Fiche certificative', 'course_en_duree', '🏃'],
    ['Escalade', 'Fiche certificative', 'escalade', '🧗'],
    ['Gymnastique', 'Fiche certificative', 'gymnastique', '🤸'],
    ['Musculation', 'Fiche certificative', 'musculation', '🏋️'],
    ['Pentabond', 'Fiche certificative', 'pentabond', '🏃'],
    ['Sauvetage', 'Fiche certificative', 'sauvetage', '🏊'],
    ['Tennis de table', 'Fiche certificative', 'tennis_de_table', '🏓'],
    ['Volley-ball', 'Proposition BAC 2023', 'volley_ball', '🏐']
  ];

  function render() {
    const w = document.getElementById('bacReferenceWrap');
    if (!w) return;
    w.innerHTML = `<div class="bac-hero"><div><small>PROGRAMMATION ANNUELLE</small>`
      + `<h2>Référentiel BAC EPS</h2>`
      + `<p>Fiches certificatives utilisées au Lycée Victor Hugo de Marrakech.</p></div><b>🎓</b></div>`
      + `<div class="bac-grid">${docs.map(([titre, sous, base, icone]) => `<article>`
        + `<i>${icone}</i>`
        + `<div><h3>${titre}</h3><p>${sous}</p></div>`
        + `<a href="bac_referentiels/${base}.pdf" target="_blank" rel="noopener">Ouvrir</a>`
        + `<a href="bac_referentiels/${base}.pdf" download>PDF</a>`
        + `<a href="bac_referentiels/${base}.docx" download>Word</a>`
      + `</article>`).join('')}</div>`;
  }

  globalThis.renderBacReference = render;
})();
