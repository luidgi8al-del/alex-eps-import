const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'aslvh.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'site.css'), 'utf8');

[
  'function showCreneauExport(slot, rows)',
  'function exportCreneauCsv(slot, rows)',
  'function printCreneauPdf(slot, rows)',
  'unssListeInscritsExportBtn',
  'unssCreneauExportBtn',
  'id="asExport"',
  '["Nom", "Prénom", "Classe", "E-mail élève", "Catégorie"]',
  '<th>Classe</th><th>E-mail élève</th><th>Catégorie</th>',
  'Enseignant :'
].forEach(marker => {
  if (!code.includes(marker)) throw new Error(`Export de créneau incomplet : ${marker}`);
});
['data-slot-eleves=', 'data-slot-appel=', 'data-slot-bilan=', 'data-slot-export='].forEach(marker => {
  if (code.includes(marker)) throw new Error(`Action encore affichée sous une carte de créneau : ${marker}`);
});
if (!css.includes('.as-panel-export')) throw new Error('Style du bouton Télécharger manquant.');
[
  'function libelleVoeuExport(student, rang)',
  '"E-mail élève", "Taille maillot"',
  's.student_email || ""',
  '<th>E-mail élève</th><th>Taille maillot</th>',
  '"Vœu 1", "Vœu 2", "Vœu 3"',
  '<th>Vœu 1</th><th>Vœu 2</th><th>Vœu 3</th>'
].forEach(marker => {
  if (!code.includes(marker)) throw new Error(`Vœux absents de l’export général : ${marker}`);
});
console.log('as-slot-export: Excel et PDF par créneau avec identité complète OK');
