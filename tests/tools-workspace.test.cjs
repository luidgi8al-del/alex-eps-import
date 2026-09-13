const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const index = read('index.html');
const workspace = read('tools-workspace.js');
const dispatch = read('outils.js');

assert.match(index, /id="toolsWorkspace"/);
assert.match(index, /tools-workspace\.js/);
assert.match(index, /tools-workspace\.css/);

for (const layout of ['activities', 'functions', 'moments', 'hybrid']) {
  assert.match(workspace, new RegExp(layout));
}

for (const renderer of [
  'renderMultiChronoWeb', 'renderTournamentWeb', 'renderObserverWeb',
  'renderRotationsWeb', 'renderRandomWeb', 'renderEffortWeb', 'renderAcrosportWeb'
]) {
  assert.match(workspace, new RegExp(renderer));
  assert.match(dispatch, new RegExp(renderer));
}

assert.match(workspace, /Organisation des outils/);
assert.match(workspace, /Corbeille/);
assert.match(workspace, /Enregistrer/);
assert.match(workspace, /Reprendre/);
assert.match(workspace, /Dupliquer/);
assert.match(workspace, /Exporter/);
assert.match(workspace, /Supprimer/);

console.log('tools-workspace: OK');
