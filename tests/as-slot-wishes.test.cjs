const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

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
const helpers = code.slice(code.indexOf('function rangsVoeuxCreneau'), code.indexOf('function sectionVoeuHtml'));
const context = vm.createContext({unssCategoryLabel:()=> 'Minime Fille',unssText:s=>String(s).replaceAll('<','&lt;')});
vm.runInContext(helpers,context);
const pupil = {last_name:'TEST',first_name:'Élève',wish1_slot_id:'wed',wish2_slot_id:'fri',wish3_slot_id:'other'};
assert.deepEqual(Array.from(context.rangsVoeuxCreneau(pupil,'wed')),[1]);
assert.deepEqual(Array.from(context.rangsVoeuxCreneau(pupil,'fri')),[2]);
assert.deepEqual(Array.from(context.rangsVoeuxCreneau(pupil,'other')),[3]);
assert.deepEqual(Array.from(context.rangsVoeuxCreneau(pupil,'none')),[]);
assert.match(context.identiteEleveCreneauHtml(pupil,[2]),/Vœu 2/);
assert.match(context.identiteEleveCreneauHtml(pupil,[]),/Hors vœux/);
assert.match(context.identiteEleveCreneauHtml(pupil,[1]),/Minime Fille/);
const panel = {innerHTML:'',classList:{remove(){},add(){}},closest(){return null;},querySelectorAll(){return []}};
Object.assign(context,{
  document:{getElementById:id=>id==='unssPanel'?panel:{addEventListener(){}}},
  ouvrirFenetreUnss(){},assurerInscriptions:async()=>{},elevesDuCreneau:()=>[pupil],
  unssStudents:[pupil],unssSlotLabel:()=> 'Vendredi',sectionVoeuHtml:()=>'',
});
vm.runInContext(code.slice(code.indexOf('async function ouvrirListeInscritsCreneau'),code.indexOf('function ouvrirAjoutElevesCreneau')),context);
(async()=>{
  await context.ouvrirListeInscritsCreneau({id:'fri',activity_name:'Escalade'});
  assert.match(panel.innerHTML,/<th>Vœu pour ce créneau<\/th>/);assert.match(panel.innerHTML,/Vœu 2/);assert.doesNotMatch(panel.innerHTML,/Vœu 1/);
  await context.ouvrirElevesCreneau({id:'wed',activity_name:'Escalade'});
  assert.match(panel.innerHTML,/Vœu 1/);assert.match(panel.innerHTML,/Minime Fille/);assert.match(panel.innerHTML,/Retirer/);
  console.log('PASS rank badges and read-only column, distinct slots, categories, no wish fallback. No registrations modified.');
})().catch(error=>{console.error(error);process.exitCode=1;});
