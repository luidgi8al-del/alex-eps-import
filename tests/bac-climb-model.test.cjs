const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../bac-climb-model.js');
for(let d=0;d<4;d++)for(let r=0;r<7;r++){
 const value={route:M.routes[r],degrees:[d,d]};
 const expected=M.bases[d]+(r-3)*.25*(d<2?-1:1);
 for(let i=0;i<2;i++)assert.equal(M.note(value,i),expected);
 assert.equal(M.total(value),expected*2);assert(expected>=0&&expected<=6);
}
assert.equal(M.note({degrees:[0,0],route:'6a'},0),0);
assert.equal(M.total({degrees:[0,0],route:'6a'}),0);
for(const value of [{}, {degrees:[0,null],route:'4a'}, {degrees:[0,0],route:''},{degrees:['0',0],route:'4a'},{degrees:[4,0],route:'4a'}])assert.equal(M.total(value),null);
for(let d=0;d<4;d++){
 for(const n of [d*1.5,(d+1)*1.5,M.bases[d]])assert.equal(M.note({degrees:[d,d],manualNotes:[n,n]},0,true),n);
 for(const n of [d*1.5-.01,(d+1)*1.5+.01,'0',null,NaN])assert.equal(M.note({degrees:[d,d],manualNotes:[n,n]},0,true),null);
}
const v={route:'4a',degrees:[0,2],manualNotes:[0,4.25]};assert.equal(M.setDegree(v,0,0,true).manualNotes[0],0);assert.equal(M.setDegree(v,0,1,true).manualNotes[0],2.25);assert.equal(v.degrees[0],0);
const rubric=JSON.parse(fs.readFileSync(path.join(__dirname,'../bac_referentiels/escalade-afl1.json')));
assert.equal(rubric.criteria.length,2);for(const c of rubric.criteria){assert.equal(c.degrees.length,4);for(const text of c.degrees)assert(text.length>100)}
assert.equal(fs.readFileSync(path.join(__dirname,'../bac_referentiels/escalade-afl1.json'),'utf8'),fs.readFileSync(path.join(__dirname,'../../installation-manager-current/app/src/main/assets/bac_referentiels/escalade-afl1.json'),'utf8'));
console.log('PASS Escalade AFL1: 28 route/degree combinations, both criteria, zero/missing/manual, identical full rubric web/Android');
