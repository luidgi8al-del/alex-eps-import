const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const source=fs.readFileSync(path.join(__dirname,'../hors-connexion.js'),'utf8');
const gate=source.slice(source.indexOf('async function schemaVague4Applique()'),source.indexOf('async function schemaVague3Applique()'));
test('class notes schema capability survives offline restart and remains account-scoped',async()=>{
 const saved=new Map();
 const ctx={session:{user_id:'a'},SUPABASE_URL:'https://fake.test',navigator:{onLine:true},localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},apiFetch:async()=>({ok:true,json:async()=>[{name:'hors_connexion_4'}]})};
 vm.createContext(ctx);vm.runInContext(gate,ctx);
 assert.equal(await ctx.schemaVague4Applique(),true);
 ctx.navigator.onLine=false;ctx.apiFetch=()=>{throw Error('No network expected')};
 assert.equal(await ctx.schemaVague4Applique(),true);
 ctx.session.user_id='b';assert.equal(await ctx.schemaVague4Applique(),false);
 ctx.session.user_id='a';ctx.navigator.onLine=true;ctx.apiFetch=async()=>({ok:true,json:async()=>[]});
 assert.equal(await ctx.schemaVague4Applique(),false);
 ctx.navigator.onLine=false;assert.equal(await ctx.schemaVague4Applique(),false);
});
test('without migration an offline observation is not falsely confirmed',async()=>{
 const dashboard=fs.readFileSync(path.join(__dirname,'../classe-tableau-bord.js'),'utf8');
 const helper=dashboard.slice(dashboard.indexOf('async function ecrireNoteClasse('),dashboard.indexOf('async function enregistrerCelluleSuiviClasse('));
 const ctx={demarrerModeHorsConnexion:async()=>{},tableSuivie:()=>false,navigator:{onLine:false}};
 vm.createContext(ctx);vm.runInContext(helper,ctx);
 await assert.rejects(()=>ctx.ecrireNoteClasse({id:'x'}),/activé sur le serveur/);
 ctx.navigator.onLine=true;ctx.SUPABASE_URL='https://fake.test';ctx.apiFetch=async()=>({ok:false});
 await assert.rejects(()=>ctx.ecrireNoteClasse({id:'x'}),/n’a pas été enregistré/);
});
