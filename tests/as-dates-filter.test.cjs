const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const aslvh = fs.readFileSync(path.join(root, 'aslvh.js'), 'utf8');
const accueil = fs.readFileSync(path.join(root, 'accueil.js'), 'utf8');
const planning = fs.readFileSync(path.join(root, 'planning.js'), 'utf8');

assert.ok(aslvh.includes('function estVraieDateAs'), 'Dates AS doit avoir un filtre dédié');
assert.ok(aslvh.includes('unssCalendarEvents.filter(estVraieDateAs)'), 'la liste AS doit employer le filtre dédié');
for (const source of [aslvh, accueil, planning]) {
  assert.ok(source.includes('Calendrier établissement LVH'), 'les imports du calendrier général doivent être exclus');
}
assert.ok(aslvh.includes('AS_DETAILS_PREFIX'), 'les fiches AS structurées restent reconnues');

console.log('Dates AS : les sorties générales de l’établissement sont exclues');
