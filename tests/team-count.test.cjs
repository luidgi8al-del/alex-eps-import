const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../teams-saved-web.js'),'utf8'),context);
for(let n=5;n<=80;n++){
 const students=Array.from({length:n},(_,i)=>({id:String(i)}));
 const teams=context.distributeToolTeams(students,5,'HOMOGENE',Object.fromEntries(students.map(s=>[s.id,3])));
 assert.equal(teams.length,5);assert(teams.every(g=>g.length>0));assert.equal(new Set(teams.flat().map(s=>s.id)).size,n);
 assert(Math.max(...teams.map(g=>g.length))-Math.min(...teams.map(g=>g.length))<=1);
}
console.log('PASS homogeneous distribution: five nonempty teams, every pupil exactly once, 5–80 pupils');
