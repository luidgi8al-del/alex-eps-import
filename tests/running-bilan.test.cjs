const {test}=require('node:test'),assert=require('node:assert/strict');
const {entry,calculate}=require('../running-bilan-model');
const s=(id,perf,reg,average=200,gap=5)=>({id:String(id),date:id,status:'complete',score:perf+reg,perf,reg,average,gap,signature:'0:run'});
test('final mean and recent weighted mean are /20, original scores unchanged',()=>{
 const data=[s(1,3,3),s(2,4,4),s(3,5,5),s(4,6,6)];
 assert.equal(calculate(data,{mode:'mean'}).score,15);assert.equal(calculate(data,{mode:'recent'}).score,16.11);assert.equal(data[0].score,6);
});
test('evolution compares first two and last two; /20 caps are separate and signed',()=>{
 const data=[s(1,2,3,210,10),s(2,2,3,208,9),s(3,4,4,190,5),s(4,4,4,188,4)];const up=calculate(data);
 assert.equal(up.performanceAdjustment,1);assert.equal(up.regularityAdjustment,1);assert.equal(up.score,12.83);assert.equal(up.chronoDelta,20);assert.equal(up.gapDelta,5);
 const down=calculate(data.map((e,i)=>({...e,date:4-i})));assert.equal(down.performanceAdjustment,-1);assert.equal(down.regularityAdjustment,-1);assert.equal(down.score,8.83);
});
test('two or three samples compare endpoints; one sample has no evolution',()=>{
 assert.equal(calculate([s(1,2,3),s(2,6,6),s(3,2,3)]).performanceAdjustment,0);
 assert.equal(calculate([s(1,2,3)]).performanceAdjustment,0);assert.equal(calculate([]).score,null);
});
test('incomplete penalties, exemptions, bounds, missing and invalid entries',()=>{
 const partial={id:'2',date:2,status:'incomplete',done:2};const data=[s(1,3,3),partial];
 assert.equal(calculate(data).score,9.5);assert.equal(calculate(data,{justified:['2']}).score,10);
 assert.equal(calculate([partial]).score,null);assert.equal(calculate([s(1,6,6),{id:'3',status:'absent'},{id:'4',status:'invalid'}]).score,20);
 assert.equal(calculate([s(1,0,0),partial],{penalty:20}).score,0);
 assert.equal(calculate([s(1,3,3),...Array.from({length:10},(_,i)=>({...partial,id:String(i+2)}))]).penalty,2);
});
test('parser reads historical times; ignores other formats, preserves incompletes and invalid warnings',()=>{
 const saved={id:'one',created_at:1000},row={result_value:8,result_unit:'/12',input_unit:'runs:500:3:group:0:difficulty:0:mode:run:times:315|320|318'};
 const e=entry(row,saved);assert.equal(e.status,'complete');assert.equal(e.reg,5.1);assert.equal(e.perf,2.9);
 assert.equal(entry({...row,input_unit:row.input_unit.replace('315|320|318','315||318'),result_unit:'/12 · en cours'},saved).status,'incomplete');
 assert.equal(entry({...row,input_unit:row.input_unit.replace('315|320|318','315|999|318')},saved).status,'invalid');
 assert.equal(entry({...row,input_unit:row.input_unit.replace('315|320|318','||')},saved).status,'absent');
 assert.equal(entry({...row,input_unit:row.input_unit.replace('500:3','250:3')},saved),null);assert.equal(entry({...row,deleted:true},saved),null);
 assert.equal(calculate([s(1,3,3),{...s(2,3,3),signature:'10:run'}]).incompatible,true);
});
