const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'outils.js'), 'utf8');

test('un élève du 3x500 passe directement dans un autre groupe', () => {
  const match = source.match(/function runningGroupsWithMovedStudents\([\s\S]*?\n\}/);
  assert.ok(match, 'la fonction de déplacement des élèves doit exister');
  const sandbox = {};
  vm.runInNewContext(`${match[0]};this.move=runningGroupsWithMovedStudents`, sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.move([['a','b'],['c']],1,['c','a']))),[['b'],['c','a']]);
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
