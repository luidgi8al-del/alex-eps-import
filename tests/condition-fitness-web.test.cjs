const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");

const source=fs.readFileSync(path.join(__dirname,"..","condition-fitness-web.js"),"utf8");
const context={globalThis:{}};
vm.createContext(context);
vm.runInContext(source,context);
const r=context.globalThis.ConditionFitnessWebRules;

assert.equal(r.pushups(38,"GARCON"),5);
assert.equal(r.pushups(24,"FILLE"),4);
assert.equal(r.abs(50,"GARCON"),4);
assert.equal(r.abs(40,"FILLE"),4);
assert.equal(r.hold(120),4);
assert.equal(r.hold(121),5);
assert.equal(r.pullups(15,"GARCON"),5);
assert.equal(r.pullups(3,"FILLE"),3);
assert.equal(r.score({pushups:"38",abs:"51",chair:"121",plank:"121",pullups:"15",flexibility:"5"},"GARCON"),5);
assert.equal(r.score({pushups:"",abs:"51",chair:"121",plank:"121",pullups:"15",flexibility:"5"},"GARCON"),null);
const old=r.decode('fitness:{"pushups":"34","chair":"90","plank":"55","pullups":"4","flexibility":"3","group":2}');
assert.equal(old.abs,"");
assert.equal(old.group,2);
const roundTrip=r.decode(r.encode({pushups:"21",abs:"31",chair:"90",plank:"90",pullups:"3",flexibility:"4",group:4}));
assert.equal(roundTrip.abs,"31");
assert.equal(roundTrip.group,4);

const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const tools=fs.readFileSync(path.join(__dirname,"..","tools-workspace.js"),"utf8");
assert.match(html,/condition-fitness-web\.js/);
assert.match(tools,/condition-fitness/);
assert.match(source,/eps_test_sessions/);
assert.match(source,/eps_test_results/);
assert.match(source,/Enregistrer les modifications/);
assert.match(source,/Exporter les groupes/);
assert.match(source,/Pompes.*Abdos.*Chaise.*Gainage.*Tractions.*Souplesse/s);
console.log("Condition physique web: barèmes, reprise, compatibilité et branchements validés.");
