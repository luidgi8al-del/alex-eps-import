const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calculate,sample,gradedSample}=require('../running-final.js');
const values=[{score:10,date:3},{score:6,date:1},{score:8,date:2}];
test('three modes use chronological sessions, not table order',()=>{
  assert.equal(calculate(values,'mean').score,8);
  assert.equal(calculate(values,'best').score,10);
  assert.equal(calculate(values,'progress',1,true).score,9);
  assert.equal(calculate(values,'progress',2,true).score,10);
});
test('other genuine grade scales use their own bounds and reject measurements',()=>{
 const saved={created_at:1720000000000},row={result_value:18,result_unit:'note /20',input_unit:'fitness:{}'};
 assert.equal(gradedSample(row,saved,20).score,18);
 for(const patch of [{result_unit:'km/h'},{result_unit:'/12'},{result_unit:'/20 · en cours'},{result_value:null},{result_value:21},{deleted:true},{input_unit:'stop:mode:couleur'},{input_unit:'gym:{"mode":"couleur"}'}])assert.equal(gradedSample({...row,...patch},saved,20),null);
 assert.equal(calculate([{score:18,date:1},{score:20,date:2}],'progress',2,false,20).score,20);
 assert.equal(calculate([{score:16,date:1},{score:18,date:2}],'mean',1,false,20).score,17);
});
test('incomplete climbing and gymnastics never enter a final grade',()=>{
 const saved={created_at:1720000000000};const row={result_value:10,result_unit:'/20',input_unit:'climb:technique=3;checked=0,1,2'};
 assert.equal(gradedSample(row,saved,20),null);
 assert.equal(gradedSample({...row,input_unit:'climb:technique=3;checked=0,1,2,3'},saved,20).score,10);
 const gym={result_value:2,result_unit:'/3',input_unit:'gym:'+JSON.stringify({mode:'note',figures:[{difficulte:'A'},{difficulte:'B'},{difficulte:''}]})};
 assert.equal(gradedSample(gym,saved,3),null);
 assert.equal(gradedSample({...gym,input_unit:gym.input_unit.replace('"difficulte":""','"difficulte":"A"')},saved,3).score,2);
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
