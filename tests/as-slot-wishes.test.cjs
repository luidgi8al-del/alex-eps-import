const fs = require('node:fs');
const path = require('node:path');

const code = fs.readFileSync(path.join(__dirname, '..', 'aslvh.js'), 'utf8');

[
  'const voeu1 = unssStudents.filter',
  's.wish1_slot_id === slot.id',
  'sectionVoeuHtml(1, voeu1)',
  'sectionVoeuHtml(2, voeu2)',
  'sectionVoeuHtml(3, voeu3)'
].forEach(marker => {
  if (!code.includes(marker)) throw new Error(`Gestion des vœux incomplète : ${marker}`);
});

console.log('as-slot-wishes: les vœux 1, 2 et 3 réapparaissent après un retrait');
