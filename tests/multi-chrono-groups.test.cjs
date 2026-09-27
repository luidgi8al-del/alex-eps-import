const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'tools-workspace.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'tools-workspace.css'), 'utf8');
const expected = [
  'Sans groupe · ordre alphabétique',
  'Constituer des groupes',
  'Modifier les groupes',
  'data-multi-edit-group',
  'Supprimer ce groupe',
  'Les chronos restent conservés',
  'Nom et prénom',
  'data-multi-time',
  'Enregistrer dans Tests EPS',
  "test_name:'Multi-chrono'",
  "enregistrerLigne('eps_test_sessions'",
  "enregistrerLigne('eps_test_results'",
  'ouvrirMultiChronoDepuisClasse',
  'Réinitialiser toutes les données',
  'Effacer tous les chronos et tous les groupes'
];

for (const marker of expected) {
  if (!js.includes(marker)) throw new Error(`Multi-chrono incomplet : ${marker}`);
}
const outils = fs.readFileSync(path.join(root, 'outils.js'), 'utf8');
if (!outils.includes("testName==='Multi-chrono'") || !outils.includes('ouvrirMultiChronoDepuisClasse')) {
  throw new Error('La fiche Multi-chrono doit pouvoir être rouverte depuis la classe.');
}
if (!css.includes('.multi-chrono-table') || !css.includes('position:sticky')) {
  throw new Error('Le tableau Multi-chrono doit garder la colonne des élèves visible.');
}
if (js.includes('if(document.getElementById("multiRows")&&timers.some(x=>x.running))drawRows()')) {
  throw new Error('Le chronomètre ne doit plus reconstruire toutes les lignes pendant la course.');
}
console.log('multi-chrono: groupes 3x500, tableau stable et remise à zéro OK');
