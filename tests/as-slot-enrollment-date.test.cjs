const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'aslvh.js'), 'utf8');
assert.ok(source.includes('<th>Vœu</th><th title="Date d’inscription">D.I</th>'), 'les colonnes compactes Vœu et D.I doivent apparaître ensemble');
assert.ok(source.includes('dateInscriptionCreneauCourte(e.id, slot.id)'), 'chaque ligne doit employer la date de son inscription au créneau');

const fonction = source.match(/function dateInscriptionCreneauCourte\(studentId, slotId\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(fonction, 'le formatage de la date doit rester testable');
const contexte = { unssInscriptions: [
  { student_id:'e1', slot_id:'s1', enrolled_at:'2026-09-07T10:00:00Z' },
  { student_id:'e2', slot_id:'s1', enrolled_at:null }
] };
vm.runInNewContext(`${fonction}; date = dateInscriptionCreneauCourte('e1','s1'); inconnue = dateInscriptionCreneauCourte('e2','s1');`, contexte);
assert.match(contexte.date, /^07\/09$/);
assert.equal(contexte.inconnue, '—');
console.log('Créneau AS : date d’inscription en jour/mois OK');
