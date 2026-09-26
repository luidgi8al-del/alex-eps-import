const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
const root=path.resolve(__dirname,'..');
const store=new Map();
const rows=Array.from({length:1205},(_,i)=>({id:String(i),class_id:i<1200?'a':'b',last_name:String(i).padStart(4,'0'),deleted:i===0}));
const ctx={URL,Response,Headers,location:{href:'https://school.test/'},SUPABASE_URL:'https://db.test',session:{user_id:'teacher-a'},
  TABLES_HORS_CONNEXION:['students'],TABLES_HORS_CONNEXION_VAGUE_2:[],
  localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},
  demarrerModeHorsConnexion:async()=>({adapter:{tables:['students']},lire:async(_,opts)=>({rows:rows.filter(opts.ou)})})};
vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(root,'offline-read.js'),'utf8'),ctx);
(async()=>{
  const url='https://db.test/rest/v1/students?deleted=eq.false&class_id=eq.a&select=id,last_name&order=last_name.asc';
  const page1=await (await ctx.offlineReadResponse(url,{headers:{Range:'0-999'}})).json();
  const page2=await (await ctx.offlineReadResponse(url,{headers:{Range:'1000-1999'}})).json();
  assert.equal(page1.length,1000);assert.equal(page2.length,199);
  assert.equal(page1[0].id,'1');assert.equal(page2.at(-1).id,'1199');
  assert.equal(new Set([...page1,...page2].map(r=>r.id)).size,1199);
  assert.deepEqual(Object.keys(page1[0]),['id','last_name']);
  const selected=await(await ctx.offlineReadResponse('https://db.test/rest/v1/students?id=in.(2,7)&select=*')).json();
  assert.deepEqual(selected.map(r=>r.id),['2','7']);
  await assert.rejects(ctx.offlineReadResponse('https://db.test/rest/v1/students?or=(id.eq.2,id.eq.7)'),/connexion/);
  await assert.rejects(ctx.offlineReadResponse('https://db.test/rest/v1/students?select=*,classes(name)'),/connexion/);
  assert.equal(await ctx.offlineReadResponse('https://other.test/rest/v1/students'),null);
  assert.equal(await ctx.offlineReadResponse('https://db.test/rest/v1/profiles'),null);
  const schema='https://db.test/rest/v1/rpc/eps_as_roster_version';
  await ctx.rememberOfflineSchema(schema,new Response('2'));
  assert.equal(await(await ctx.offlineReadResponse(schema)).json(),2);
  ctx.session={user_id:'teacher-b'};
  await assert.rejects(ctx.offlineReadResponse(schema),/Préparez/);
  console.log('offline-read: filters, 1205-row pagination, projection, schema account isolation, unsupported queries OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
