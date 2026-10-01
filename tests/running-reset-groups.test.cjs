const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'outils.js'), 'utf8');

test('la remise à zéro du 3x500 conserve les groupes', () => {
  assert.match(source, /function resetRunningSession\(preserveGroups=false\)/);
  assert.match(source, /runningGroups\.map\(g=>\[\.\.\.g\]\)/);
  assert.match(source, /runningResetAll'[\s\S]*?resetRunningSession\(true\)/);
  assert.match(source, /Les groupes et les sessions déjà enregistrées seront conservés/);
});

test('une nouvelle saisie 3x500 conserve également les groupes', () => {
  assert.match(source, /blankButton\.onclick=\(\)=>\{resetRunningSession\(true\)/);
});
