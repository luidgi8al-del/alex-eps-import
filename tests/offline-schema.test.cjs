const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const values=new Map(),ctx={SUPABASE_URL:'https://db.test',session:{user_id:'a'},navigator:{onLine:true},
localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},
apiFetch:async()=>({ok:true,json:async()=>[{name:'hors_connexion_2'}]})};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../hors-connexion.js'),'utf8'),ctx);
(async()=>{
 assert.equal(await ctx.schemaVague2Applique(),true);
 ctx.navigator.onLine=false;ctx.apiFetch=()=>{throw Error('must not use network');};
 assert.equal(await ctx.schemaVague2Applique(),true);
 ctx.session={user_id:'b'};assert.equal(await ctx.schemaVague2Applique(),false);
 console.log('offline-schema: AS/santé tables survive restart without network; account isolation OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
