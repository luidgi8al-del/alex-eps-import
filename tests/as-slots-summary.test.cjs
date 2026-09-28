const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const code = fs.readFileSync(require('node:path').join(__dirname, '../aslvh.js'), 'utf8');
function declaration(name) {
  const start = code.indexOf(`function ${name}(`);
  const next = code.indexOf('\nfunction ', start + 1);
  return code.slice(start, next < 0 ? undefined : next);
}
const ctx = vm.createContext({ Date, unssSlots: [], capitaliseJour: x => x,
  unssText: x => String(x).replaceAll('&','&amp;').replaceAll('<','&lt;') });
for (const name of ['signatureProfesseurAS', 'heureEmailAS', 'allSlotsExportRows', 'allSlotsPrintHtml']) {
  vm.runInContext(declaration(name), ctx);
}
for (const name of ['Eisenmann','Schmitt','Thooris']) {
  assert.equal(ctx.signatureProfesseurAS(name), `Mme ${name}`);
  assert.equal(ctx.signatureProfesseurAS(`M. ${name}`), `Mme ${name}`);
}
assert.equal(ctx.signatureProfesseurAS('Regnier'), 'M. Regnier');
assert.equal(ctx.signatureProfesseurAS('Mme Dupont'), 'Mme Dupont');
const rows = ctx.allSlotsExportRows([
  {activity_name:'Aquathlon',responsible_teacher:'Regnier',day_of_week:'Mercredi',start_time:'13:00:00',end_time:'15:30:00'},
  {activity_name:'Natation',responsible_teacher:'Thooris',day_of_week:'Lundi',start_time:'12:00',end_time:'13:00'},
  {activity_name:'Ancien',deleted:true}
]);
assert.equal(rows.length, 2);
assert.equal(rows[0][1], 'M. Regnier');
assert.equal(rows[0][3], '13h');
assert.equal(rows[0][4], '15h30');
assert.equal(rows[1][1], 'Mme Thooris');
const html = ctx.allSlotsPrintHtml(rows);
assert(html.includes('Aquathlon') && html.includes('Mme Thooris'));
assert(!html.includes('Ancien'));
assert(ctx.allSlotsPrintHtml([['<script>', '', '', '', '']]).includes('&lt;script>'));
console.log('PASS all slots exported with teacher, day, times, confirmed civilities and escaped PDF content');
