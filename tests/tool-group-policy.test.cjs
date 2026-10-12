const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const sandbox={EpsToolWorkflow:{esc:String},globalThis:null};sandbox.globalThis=sandbox;vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','tool-group-editor.js'),'utf8'),sandbox);
const G=sandbox.EpsToolGroups;
test('editor only proposes current group and unassigned students',()=>{
 const state={groups:[{id:'1'},{id:'2'}],assignments:{a:1,b:2},numericGroups:true};
 assert.deepEqual(Array.from(G.eligible(state,'1',[{id:'a'},{id:'b'},{id:'c'}]),s=>s.id),['a','c']);
 assert.deepEqual(Array.from(G.eligible(state,null,[{id:'a'},{id:'b'},{id:'c'}]),s=>s.id),['c']);
});
test('composition releases pupils, keeps other groups, does not touch grades or source state',()=>{
 const state={groups:[{id:'1'},{id:'2'}],assignments:{a:1,b:1,c:2},numericGroups:true,values:{a:0,b:8}};
 const before=JSON.stringify(state),result=G.composition(state,'1',['b','d']);
 assert.equal(result.a,undefined);assert.equal(result.b,1);assert.equal(result.c,2);assert.equal(result.d,1);
 assert.equal(JSON.stringify(state),before);
});
test('string identities remain compatible with legacy class works',()=>{
 const state={assignments:{a:'g2',b:'g1'},values:{a:'315'}};
 const result=G.composition(state,'g2',['c']);assert.equal(result.a,undefined);assert.equal(result.c,'g2');assert.equal(result.b,'g1');assert.equal(state.values.a,'315');
});
