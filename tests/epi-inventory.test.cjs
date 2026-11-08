const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../epi-inventory-model.js');
const now=1800000000000;
const item={id:'epi-school-bau-001',active:true,status:'EN_SERVICE',last_inspection_date_epoch_millis:now-86400000,next_inspection_date_epoch_millis:now+60*86400000};
test('inventory has 120 prepared slots including the requested 30 ropes',()=>{
 assert.equal(M.families.reduce((n,f)=>n+f.target,0),120);assert.equal(M.families.find(f=>f.key==='CORDE').target,30);
});
test('activation is independent from safety and old records stay active',()=>{
 assert.equal(M.active({}),true);assert.equal(M.active({active:false}),false);
 assert.equal(M.rows([item,{...item,id:'inactive',active:false},{...item,id:'deleted',deleted:true}],'BAUDRIER').length,0);
 assert.equal(M.rows([item,{...item,id:'inactive',active:false},{...item,id:'deleted',deleted:true}],null,true).length,1);
 assert.equal(M.rows([{...item,active:false,status:'QUARANTAINE'}],null,false).length,1);
});
test('only an unremarked controlled record away from expiry is green',()=>{
 assert.equal(M.state(item,now),'green');
 for(const delta of [{last_inspection_date_epoch_millis:null},{next_inspection_date_epoch_millis:null},{comment:'Usure à surveiller'},{status:'A_CONTROLER'},{status:'UNKNOWN'},{next_inspection_date_epoch_millis:now+30*86400000}])assert.equal(M.state({...item,...delta},now),'orange');
 for(const delta of [{status:'QUARANTAINE'},{status:'REFORME'},{end_of_life_date_epoch_millis:now}])assert.equal(M.state({...item,...delta},now),'red');
});
test('permanent link depends on immutable id and rejects external or malformed links',()=>{
 const link=M.link(item.id);assert.equal(M.idFromLink(link),item.id);assert.equal(M.link({...item,internal_id:'renamed'}.id),link);
 for(const link of ['https://evil.test/?epi=x','javascript:alert(1)','https://luidgi8al-del.github.io/another/?epi=x',M.link('valid').replace('valid','%3Cscript%3E')])assert.equal(M.idFromLink(link),null);
 assert.throws(()=>M.link('../x'));
});
