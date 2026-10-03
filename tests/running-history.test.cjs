const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../outils.js'),'utf8');
function setup(){
 const sandbox={runningSessions:[],runningSessionId:null};vm.createContext(sandbox);
 const start=source.indexOf('let runningSessionFormats=');
 const end=source.indexOf('async function openRunningSession',start);
 vm.runInContext(source.slice(start,end),sandbox);return sandbox;
}
test('reads the stored format, not the canonical tool name',()=>{
 const s=setup();assert.equal(s.runningSavedFormat('runs:250:6:group:0:times:127|128'),'6 × 250 m');
 assert.equal(s.runningSavedFormat('runs:500:3:group:0'),'3 × 500 m');
 assert.equal(s.runningSavedFormat('runs:250:8:group:0'),'8 × 250 m');
 assert.equal(s.runningSavedFormat('unknown'),null);
});
test('latest date is shown and selected older date stays in collapsed summary',()=>{
 const s=setup();s.runningSessions=[{id:'new',created_at:'2026-09-24T10:00:00Z',period_number:1},{id:'old',created_at:'2026-09-17T10:00:00Z',period_number:1}];
 vm.runInContext("runningSessionFormats={new:'3 × 500 m',old:'6 × 250 m'}",s);
 assert.match(s.runningHistoryHtml().split('</summary>')[0],/24\/09\/2026/);
 s.runningSessionId='old';const html=s.runningHistoryHtml();
 assert.match(html.split('</summary>')[0],/17\/09\/2026.*6 × 250 m/);
 assert.ok(!html.includes('<details class="running-history" open'));
 assert.match(html,/data-running-session="new"/);
});
test('history loads format from results and sorts ISO dates, including offline predicate',async()=>{
 const s=setup();s.onRealClass=()=>true;s.toolClassId='c';s.epsTestPeriod=1;
 s.lireTable=async(table,url,options)=>table==='eps_test_sessions'?[{id:'old',created_at:'2026-09-17',class_id:'c',period_number:1},{id:'new',created_at:'2026-09-24',class_id:'c',period_number:1}]:[
 {session_id:'old',input_unit:'runs:250:6:group:0'},
 {session_id:'new',input_unit:'runs:500:3:group:0'},
 {session_id:'other',input_unit:'runs:250:9:group:0'},
 ].filter(options.ou);
 await s.loadRunningSessions();assert.equal(s.runningSessions[0].id,'new');s.runningSessionId='old';
 assert.match(s.runningHistoryHtml().split('</summary>')[0],/6 × 250 m/);
});
test('empty history and invalid date stay readable',()=>{
 const s=setup();assert.match(s.runningHistoryHtml(),/Aucune séance/);assert.equal(s.runningSessionDate('bad'),'Date non renseignée');
});
