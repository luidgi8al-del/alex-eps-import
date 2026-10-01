const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const screens = fs.readFileSync(path.join(root, 'classe-ecrans.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'classe-tableau-bord.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'site.css'), 'utf8');

for (const label of ['Chewing-gum', 'Bouteille en plastique', 'Écouteurs', 'Téléphone', 'Matériel oublié', 'Tenue oubliée ou inadaptée', 'Comportement inadapté']) {
  assert.ok(screens.includes(label), `motif absent : ${label}`);
}
assert.ok(screens.includes('data-vue="suivi"'), 'le suivi doit rester accessible depuis le tableau de bord');
assert.ok(screens.includes('function ecDessinerSuiviClasse'), 'le tableau par élèves et dates doit exister');
assert.ok(screens.includes('ecAfficherAlerteSuivi'), 'une répétition doit déclencher une notification');
assert.ok(screens.includes('ecNombreMotifSuivi(eleve.id, m) >= 1'), 'la deuxième observation doit être détectée avant enregistrement');
assert.ok(dashboard.includes('PREFIXE_SUIVI_CLASSE'), 'le suivi doit être persisté sans se mélanger au bloc-notes');
assert.ok(dashboard.includes('function normaliserDateSuiviClasse'), 'les objets Date des séances doivent être convertis en date ISO');
assert.ok(screens.includes('.map(normaliserDateSuiviClasse)'), 'les colonnes doivent recevoir des dates valides');
const normaliseur = dashboard.match(/function normaliserDateSuiviClasse\(valeur\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(normaliseur, 'le normaliseur de date doit rester testable');
const contexte = {};
vm.runInNewContext(`${normaliseur}; resultat = normaliserDateSuiviClasse(new Date(2026, 8, 4, 12));`, contexte);
assert.equal(contexte.resultat, '2026-09-04', 'une Date de séance doit devenir AAAA-MM-JJ');
assert.ok(dashboard.includes('observationsSuivi'), 'les observations doivent remonter dans le dossier élève');
assert.ok(css.includes('.ec-suivi-table th:first-child') && css.includes('position:sticky'), 'la colonne des élèves doit rester visible');

console.log('Suivi de classe permanent et alerte de répétition : OK');
