const {test}=require('node:test'),assert=require('node:assert/strict');
const {complete,series,html,evaluationSeries}=require('../student-results.js');
test('draft and partial never become real zeros, a completed zero remains valid',()=>{
 assert.equal(complete({result_value:0,result_unit:'brouillon'}),false);
 assert.equal(complete({result_value:0,result_unit:'km/h|brouillon'}),false);
 assert.equal(complete({result_value:3,result_unit:'/12 · en cours'}),false);
 assert.equal(complete({result_value:0,result_unit:'/20'}),true);
 assert.equal(complete({result_value:'',result_unit:'/20'}),false);
});
test('physical grade six partial records have raw graphs but no fake completed total',()=>{
 const rows=[1,2].map(i=>({session_id:String(i),input_unit:`sprint:${8-i}|palier:|saut:${120+i*5}`,result_value:0,result_unit:'aptitudes /3'}));
 assert.equal(complete(rows[0]),false);
 const results=series(rows,[{id:'1',test_name:'Aptitudes physiques 6e',created_at:1000},{id:'2',test_name:'Aptitudes physiques 6e',created_at:2000}]);
 assert.deepEqual(results.map(g=>g.unit),['s','cm']);
});
test('competency progress does not mix different activities or changed scales',()=>{
 const criterion={id:'c',label:'Technique',max_points:5};
 const e=(cycle,date,score,max=5)=>({cycle_id:cycle,date_epoch_millis:date,criteres:[{...criterion,max_points:max}],notes:[{criterion_id:'c',points:score}]});
 const results=evaluationSeries([e('danse',1000,2),e('danse',2000,4),e('natation',3000,1),e('danse',4000,7,10)],[{id:'danse',apsa_name:'Danse'},{id:'natation',apsa_name:'Natation'}]);
 assert.equal(results.length,1);assert.deepEqual(results[0].points.map(p=>p.value),[2,4]);
});
test('same test and protocol only, raw times sorted chronologically',()=>{
 const sessions=[{id:'a',test_name:'3 × 500',created_at:1000},{id:'b',test_name:'3 × 500',created_at:2000},{id:'c',test_name:'3 × 500',created_at:3000}];
 const row=(id,d,time)=>({session_id:id,result_unit:'/12',result_value:8,input_value:time,input_unit:`runs:${d}:3:group:0:difficulty:0:mode:run:times:315|315|315`});
 const result=series([row('b',500,190),row('a',500,200),row('c',250,90)],sessions);
 assert.equal(result.length,1);assert.deepEqual(result[0].points.map(p=>p.value),[200,190]);assert.match(result[0].unit,/s/);
 assert.match(html([row('b',500,190),row('a',500,200)],sessions,String),/200 → 190/);
});
