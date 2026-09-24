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
  'data-slot-export=',
  '["Nom", "Prénom", "Classe", "Catégorie"]',
  'Enseignant :'
].forEach(marker => {
  if (!code.includes(marker)) throw new Error(`Export de créneau incomplet : ${marker}`);
});
if (!css.includes('.as-panel-export')) throw new Error('Style du bouton Télécharger manquant.');
console.log('as-slot-export: Excel et PDF par créneau avec identité complète OK');
