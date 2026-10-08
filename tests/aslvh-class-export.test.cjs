const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'aslvh.js'), 'utf8');
const start = code.indexOf('function classeTableurAs');
const end = code.indexOf('\nfunction exportLicenciesCsv', start);
if (start < 0 || end < 0) throw new Error('Fonctions d’export ASLVH introuvables.');

const context = {};
vm.runInNewContext(`${code.slice(start, end)}\nthis.classeTableurAs = classeTableurAs; this.celluleCsvAs = celluleCsvAs;`, context);

const assertEqual = (actual, expected, label) => {
  if (actual !== expected) throw new Error(`${label}: attendu ${expected}, obtenu ${actual}`);
};

assertEqual(context.classeTableurAs({ division: '2-01' }), '="2-01"', 'division avec tiret');
assertEqual(context.classeTableurAs({ school_class_label: '1-07' }), '="1-07"', 'classe de secours');
assertEqual(context.classeTableurAs({ division: 'Terminale Lundi' }), '="Terminale Lundi"', 'division en texte');
assertEqual(context.celluleCsvAs(context.classeTableurAs({ division: '2-01' })), '"=""2-01"""', 'cellule Excel texte');
assertEqual(context.celluleCsvAs('=DANGEREUX()'), '"\'=DANGEREUX()"', 'protection formule arbitraire');

[
  'classeTableurAs(s)',
  'classeTableurAs(student)',
  'classeTableurAs(e)'
].forEach(marker => {
  if (!code.includes(marker)) throw new Error(`Export ASLVH non harmonisé : ${marker}`);
});

console.log('aslvh-class-export: les divisions restent du texte dans Excel OK');
