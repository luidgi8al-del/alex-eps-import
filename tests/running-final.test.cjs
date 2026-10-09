const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calculate,sample}=require('../running-final.js');
const values=[{score:10,date:3},{score:6,date:1},{score:8,date:2}];
test('three modes use chronological sessions, not table order',()=>{
  assert.equal(calculate(values,'mean').score,8);
  assert.equal(calculate(values,'best').score,10);
  assert.equal(calculate(values,'progress',1,true).score,9);
  assert.equal(calculate(values,'progress',2,true).score,10);
});
test('negative progress, optional malus, bounds, absence and single test',()=>{
  const falling=[{score:10,date:1},{score:6,date:2}];
  assert.equal(calculate(falling,'progress',1,true).score,7);
  assert.equal(calculate(falling,'progress',1,false).score,8);
  assert.equal(calculate([{score:11,date:1},{score:12,date:2}],'progress',2,true).score,12);
  assert.equal(calculate([{score:1,date:1},{score:0,date:2}],'progress',2,true).score,0);
  assert.equal(calculate([],'mean').score,null);
  assert.equal(calculate([{score:0,date:1}],'progress').score,0);
  assert.equal(calculate([{score:7,date:1}],'progress').delta,null);
});
test('incomplete, deleted and different formats are excluded; difficulty retained',()=>{
  const row={result_value:8,result_unit:'/12',input_unit:'runs:500:3:group:0:difficulty:10:mode:run:times:315|320|318'};
  const session={created_at:1720000000000};
  assert.equal(sample(row,session).score,8);
  assert.equal(sample(row,session).signature,'10:run');
  assert.equal(sample({...row,result_unit:'/12 · en cours'},session),null);
  assert.equal(sample({...row,deleted:true},session),null);
  assert.equal(sample({...row,input_unit:row.input_unit.replace('500:3','250:3')},session),null);
  assert.equal(sample({...row,input_unit:row.input_unit.replace('315|320|318','315||318')},session),null);
  assert.equal(sample({...row,result_value:null},session),null);
});
