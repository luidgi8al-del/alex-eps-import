const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../bac-rubrics.js'),M=require('../bac-grids-model.js');
assert.equal(Object.keys(S).length,9);
const params={outcome:'win',difficulty:'1.1',round:'no',figure0:'A',figure1:'B',figure2:'C',figure3:'D',missing:'0'};
let count=0;
for(const s of Object.values(S)){
 assert.equal(s.criteria.reduce((a,c)=>a+c.max,0),12);
 assert.equal(M.total(s,{}),null);
 for(let i=0;i<2;i++)for(let d=0;d<4;d++){
  const c=s.criteria[i],band=c.degrees[d].range;assert(c.degrees[d].text.length>20);
  const values=c.choices?c.choices[d].map(o=>o.value):[band[0],(band[0]+band[1])/2,band[1]];
  for(let k=0;k<values.length;k++){
   const n=values[k],v=M.setNote({params},i,d,n,c.choices?k:null);
   assert.equal(M.base(s,v,i),n,`${s.id} ${i} ${d} ${k}`);
   const score=M.result(s,v,i)?.score;assert(score>=0&&score<=c.max);
   assert.equal(M.total(s,v),null,'Incomplete student cannot export a total');count++;
  }
  for(const n of [null,'0',NaN,-1,100])assert.equal(M.base(s,M.setNote({},i,d,n),i),null);
 }
}
const sample=(notes,degrees=[3,3],p=params)=>({notes,degrees,params:p});
assert.equal(M.total(S.volley_ball,sample([7,5])),12);
assert.equal(M.result(S.volley_ball,sample([1.5,.5],[0,0]),0).score,1.98);
assert.equal(M.result(S.acrosport,sample([8,4]),0).score,5.6);
assert.equal(M.result(S.acrosport,sample([8,4],[3,3],{...params,missing:'2'}),0).score,4.6);
assert.equal(M.result(S.acrosport,sample([0,0],[0,0],{...params,missing:'16'}),0).score,0);
assert.equal(M.result(S.gymnastique,sample([7,4]),0).score,7.7);
assert.equal(M.result(S.gymnastique,sample([7,4],[3,3],{...params,round:'yes'}),0).score,8);
assert.equal(M.total(S.musculation,sample([0,0],[0,0],{})),0);
assert.equal(M.total(S.course_en_duree,sample([8,4])),12);
assert.equal(M.total(S.badminton,{degrees:[3,3],choices:[2,2],notes:[8,4]}),12);
assert.equal(M.total(S.sauvetage,{degrees:[3,3],choices:[2,5],notes:[6,6]}),12);
assert.equal(M.total(S.pentabond,{degrees:[3,3],choices:[6,6],notes:[6,6]}),12);
const raw=fs.readFileSync(path.join(__dirname,'../bac_referentiels/afl1-grids.json'),'utf8');assert.deepEqual(JSON.parse(raw),S);
assert.equal(raw,fs.readFileSync(path.join(__dirname,'../../installation-manager-current/app/src/main/assets/bac_referentiels/afl1-grids.json'),'utf8'));
console.log('PASS nine AFL1 grids:',count,'valid rubric combinations, corrections, adjustments, null/zero, identical web/Android source');
