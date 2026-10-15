const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements={wfClass:{value:''},wfPeriod:{},wfFree:{value:''}};
let warnings=0,accept=false,draws=0;
const ctx={structuredClone,document:{getElementById:id=>elements[id]},toolClasses:[],toolPanel:{inert:false},confirm:()=>{warnings++;return accept}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../tools-workflows.js'),'utf8'),ctx);
const W=ctx.EpsToolWorkflow;
async function change(state,target='class-b',active=false){elements.wfClass.value=target;W.bindContext(state,async()=>{draws++},()=>active);await elements.wfClass.onchange()}
(async()=>{
 for(const defaults of [{},{freeNames:'Coureur libre\nObservateur libre'}]){
  const state=W.stateFor(null,defaults);warnings=0;await change(state);assert.equal(warnings,0);assert.equal(state.classId,'class-b');await change(state,'class-c');assert.equal(warnings,0);
 }
 for(const patch of [{values:{s:{runs:[{first:60},{},{}]}}},{values:{s:{runs:[{observerId:'o'}]}}},{values:{s:{progress:0}}},{groups:[{id:'g',name:'Groupe 1'}]},{assignments:{s:'g'}},{freeNames:'Élève ajouté'}]){
  const state=Object.assign(W.stateFor(),structuredClone(patch)),before=JSON.stringify(state);warnings=0;await change(state);assert.equal(warnings,1);assert.equal(JSON.stringify(state),before);assert.equal(elements.wfClass.value,'');assert.equal(ctx.toolPanel.inert,false);
 }
 const empty=W.stateFor();empty.values={s:{runs:[{first:null,total:null,validated:false},{},{}]}};warnings=0;await change(empty);assert.equal(warnings,0);
 warnings=0;await change(W.stateFor(),'class-b',true);assert.equal(warnings,1);
 const saved=W.stateFor({classId:'class-a',payload:{values:{s:{first:60}}}});warnings=0;await change(saved,'class-a');assert.equal(warnings,0);
 accept=true;await change(saved);assert.equal(warnings,1);assert.equal(saved.classId,'class-b');assert.equal(Object.keys(saved.values).length,0);
 assert(draws>0);console.log('PASS class change: untouched, defaults, zero, observer, times, groups, custom names, active timer, cancel, confirm, same class');
})().catch(e=>{console.error(e);process.exitCode=1});
