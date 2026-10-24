const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../outils.js'),'utf8'),ctx=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('let runningDistance='),source.indexOf('function runningTimeLabel')),ctx);
for(const value of ['','0','00','000','-10','1.2','abc','1:2','260','1000'])assert.equal(vm.runInContext(`compactRunningSeconds(${JSON.stringify(value)})`,ctx),null,value);
for(const [value,expected] of [['001',1],['130',90],['315',195],['959',599]])assert.equal(vm.runInContext(`compactRunningSeconds(${JSON.stringify(value)})`,ctx),expected);
for(const times of [['0','0','0'],['130','0','132'],['130','260','132'],['130','abc','132'],['130','-10','132']]){
  vm.runInContext(`runningValues.test=${JSON.stringify(times)}`,ctx);
  assert.equal(vm.runInContext("runningSummary({id:'test',sex:'M'})",ctx),null,JSON.stringify(times));
  vm.runInContext("runningWalking.add('test')",ctx);
  assert.equal(vm.runInContext("runningSummary({id:'test',sex:'F'})",ctx),null);
  vm.runInContext("runningWalking.clear()",ctx);
}
// Keep the teacher's existing inclusive boundaries and allow removed runs, not invalid ones.
assert.equal(vm.runInContext('runningRegularity(2)',ctx),6);
assert.equal(vm.runInContext('runningRegularity(4)',ctx),5.7);
vm.runInContext("runningValues.test=['130',RUNNING_REMOVED,'132']",ctx);
assert.equal(vm.runInContext("runningSummary({id:'test',sex:'M'}).reg",ctx),6);
assert(source.includes("raw.some(v=>String(v??'').trim()!=='')"),'Invalid draft input is kept on explicit save');
console.log('PASS 3x500: invalid/zero times never produce a grade, valid times and inclusive thresholds unchanged');
