const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'classe-tableau-bord.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'site.css'), 'utf8');

for (const label of ['Synthèse', 'Évaluations et tests', 'Participation', 'Observations', 'Adaptation', 'Documents']) {
  assert.ok(source.includes(label), `rubrique manquante : ${label}`);
}

assert.match(source, /id="modifierFicheEleve"/);
assert.match(source, /function modifierFicheEleve\(studentId\)/);
assert.match(source, /rest\/v1\/students\?id=eq\./);
assert.match(source, /Le motif médical détaillé n’est pas affiché ici\./);
assert.match(source, /Les appels restent gérés dans Pronote/);
assert.match(source, /birth_date_epoch_millis/);
assert.match(css, /\.student-progress-tabs/);
assert.match(css, /\.student-edit-grid/);

console.log('Fiche de progression élève : OK');
