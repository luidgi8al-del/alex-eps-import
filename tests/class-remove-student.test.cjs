const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const screen = fs.readFileSync(path.join(root, 'classe-ecrans.js'), 'utf8');
const help = fs.readFileSync(path.join(root, 'aide.js'), 'utf8');

test('un élève peut être retiré directement depuis la liste de sa classe', () => {
  assert.match(screen, /data-ec-retirer-eleve/);
  assert.match(screen, /Retirer de cette classe/);
  assert.match(screen, /modeHorsConnexion\.supprimer\("students", studentId\)/);
  assert.match(screen, /deleted: true/);
  assert.match(screen, /dashboardStudents = dashboardStudents\.filter/);
  assert.match(help, /À droite du niveau EPS, ouvrez Actions/);
});
