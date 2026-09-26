const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'aslvh.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'site.css'), 'utf8');

if (!code.includes('Appels enregistrés') || !code.includes('Taux de présence')) {
  throw new Error('Les deux vues doivent rester côte à côte dans le créneau sélectionné.');
}
if (!code.includes('idsSeances.has(String(p.session_id))')) {
  throw new Error('Le taux doit être calculé uniquement avec les appels du créneau sélectionné.');
}
if (!css.includes('.as-attendance-list')) {
  throw new Error('Le récapitulatif individuel doit garder son affichage harmonisé.');
}
[
  'as-slot-compact',
  'ASLVH',
  'Élèves inscrits',
  'Présence moyenne',
  'PROCHAINE SÉANCE',
  'id="unssNouvelAppel"',
  'data-seance=',
  'data-supprimer-seance=',
  'ouvrirEditeurAppel(creneau, null)',
  'ouvrirEditeurAppel(creneau, seance)',
  'as-history-actions-menu'
].forEach(marker => {
  if (!code.includes(marker)) throw new Error(`La nouvelle page d’appel doit conserver : ${marker}`);
});
['.as-call-page', '.as-slot-compact', '.as-call-kpis', '.as-history-table', '.as-next-card', '.as-call-modal', '.as-history-actions-menu'].forEach(marker => {
  if (!css.includes(marker)) throw new Error(`Style manquant pour la nouvelle page : ${marker}`);
});
console.log('as-attendance-tabs: tableau de bord, historique, actions et taux individuels OK');
