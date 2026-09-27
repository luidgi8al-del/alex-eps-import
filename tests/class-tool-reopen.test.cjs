const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const classes = fs.readFileSync(path.join(root, 'classe-ecrans.js'), 'utf8');
const tools = fs.readFileSync(path.join(root, 'tools-workspace.js'), 'utf8');

[
  'async function ecTravauxDeLaClasse()',
  'eps_saved_tool_works',
  'class_id=eq.${dashboardClass.row.id}',
  'await ecTravauxDeLaClasse()',
  'ecRouvrirTravail(w)',
  'enregistrerLigne("eps_saved_tool_works"'
].forEach(marker => {
  if (!classes.includes(marker)) throw new Error(`Divers EPS non raccordé aux classes : ${marker}`);
});

[
  'ouvrirMultiChronoDepuisClasse',
  "test_name:'Multi-chrono'",
  "enregistrerLigne('eps_test_sessions'",
  "enregistrerLigne('eps_test_results'"
].forEach(marker => {
  if (!tools.includes(marker)) throw new Error(`Cycle de vie Multi-chrono incomplet : ${marker}`);
});

console.log('classes: Multi-chrono et travaux Divers enregistrables et réouvrables OK');
