const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),M=require('../running-observation-model.js');
const source=fs.readFileSync(path.join(__dirname,'../outils.js'),'utf8'),ctx=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function runningRegularity('),source.indexOf('function runningSummary(')),ctx);
const rules=vm.runInContext('({regularity:runningRegularity,performance:runningPerformance,walking:walkingPerformance})',ctx);
const pupil=times=>({runs:times.map(t=>({first:t/2,total:t}))});
assert.equal(M.summary(pupil([89,89,89]),{},'G',rules).total,12);
assert.equal(M.summary(pupil([89,89,89]),{},'M',rules).total,12);
assert.equal(M.summary({...pupil([225,225,225]),walking:true},{},'',rules).total,12);
assert.equal(M.summary(pupil([89,89]),{},'G',rules).total,null);
assert.equal(M.summary(pupil([89,89,89]),{},'',rules).total,null);
assert.equal(M.summary(pupil([89]),{count:1},'G',rules).scale,6);
assert.equal(M.summary({...pupil([225]),walking:true},{count:1},'',rules).scale,3);
let p=M.setObserver(pupil([120,121,122]),'observer',3);assert(p.runs.every(r=>r.observerId==='observer'));p.runs[0].validated=true;p=M.setObserver(p,'other',3);assert(p.runs.every(r=>!r.validated));assert.equal(p.runs[0].total,120);
p=M.extendRuns(p,5);assert.equal(p.runs[4].observerId,'other');assert.equal(M.extendRuns(p,2).runs.length,5,'Shrinking must not erase hidden courses');
const fixtures=[];
for(const distance of [250,500])for(const count of [1,3,5,10])for(const difficulty of [-30,0,30])for(const sex of ['G','F',''])for(const walking of [false,true]){
 const config={distance,count,difficulty,version:2},student={...pupil(Array.from({length:count},(_,i)=>distance===250?70+i%3:140+i%3)),walking};
 fixtures.push({config,pupil:student,sex,expected:M.summary(student,config,sex,rules)});
}
const target=path.join(__dirname,'../../installation-manager-current/app/build/reports/running-observation-score-parity.json');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(fixtures));
const checkedIn=path.join(__dirname,'../../installation-manager-current/app/src/test/resources/running-observation-score-parity.json');assert.deepEqual(JSON.parse(fs.readFileSync(checkedIn,'utf8')),fixtures);
console.log('PASS classic grade, missing times/sex, walking, single-run scale, observers, preservation; '+fixtures.length+' Android parity fixtures');
