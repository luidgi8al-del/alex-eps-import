const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'outils.js'), 'utf8');

test('la fenêtre de modification propose le groupe courant et les élèves non attribués', () => {
  const match = source.match(/function runningEditableStudentIds\([\s\S]*?\n\}/);
  assert.ok(match, 'la fonction de sélection des élèves modifiables doit exister');
  const sandbox = {};
  vm.runInNewContext(`${match[0]};this.editable=runningEditableStudentIds`, sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.editable([['a','b'],['c']],0,['a','b','c','d']))),['a','b','d']);
});

test('la remise à zéro du 3x500 conserve les groupes', () => {
  assert.match(source, /function resetRunningSession\(preserveGroups=false\)/);
  assert.match(source, /runningGroups\.map\(g=>\[\.\.\.g\]\)/);
  assert.match(source, /runningResetAll'[\s\S]*?resetRunningSession\(true\)/);
  assert.match(source, /Les groupes et les sessions déjà enregistrées seront conservés/);
});

test('une nouvelle saisie 3x500 conserve également les groupes', () => {
  const body=source.match(/blankButton\.onclick=\(\)=>\{([^}]+)\}/)[1];
  const calls=[];
  require('node:vm').runInNewContext(body, {
    rememberRunningUndo:kind=>calls.push(['undo',kind]),
    resetRunningSession:preserve=>calls.push(['reset',preserve]),
    paintRunningSeriesTest:()=>{},test:{}
  });
  assert.deepEqual(calls,[['undo','results'],['reset',true]]);
});
