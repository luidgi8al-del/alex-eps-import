// Real IndexedDB and browser. All accounts, lessons and remote responses are synthetic.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  if(req.url==='/store.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(fs.readFileSync(path.join(root,'eppcs-store.js')))}
  res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><meta charset="utf-8"><script src="/store.js"></script>');
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
  const pass=[];
  async function scenario(name,fn){
    const context=await browser.newContext({serviceWorkers:'block'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage();await page.goto(origin);
    await page.evaluate(()=>{
      window.account={user_id:'A',access_token:'synthetic-token'};
      window.check=(value,message)=>{if(!value)throw Error(message)};
      window.library={format:'synthetic',courses:[{id:'cours-1',title:'Cours fictif'}]};
      window.remote=new Map();window.calls=[];window.network=true;
      window.fake=async(url,options={})=>{
        if(!network)throw new TypeError('Network unavailable');
        const u=new URL(url);calls.push({url,method:options.method||'GET',token:options.headers.Authorization,body:options.body});
        let data;
        if(options.method==='POST'){
          const body=JSON.parse(options.body),old=remote.get(body.p_document_id);
          if((old?.revision||0)!==body.p_expected)data={saved:false,current:old||null};
          else {const row={user_id:account.user_id,document_id:body.p_document_id,revision:(old?.revision||0)+1,payload:body.p_payload};remote.set(row.document_id,row);data={saved:true,revision:row.revision};}
        }else data=[...remote.values()];
        return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
      };
      window.options={userId:'A',getSession:()=>account};
      window.cloudOptions={...options,baseUrl:'https://synthetic.invalid',anonKey:'public-fixture',fetch:(...args)=>fake(...args)};
    });
    try {await fn(page);pass.push(name);console.log('PASS '+name)}finally{await context.close()}
  }
  try{
    await scenario('copie durable locale et séparation des comptes',async page=>{
      await page.evaluate(async()=>{
        window.store=EPPCSStore.create(options);await store.importLibrary(library);
        await store.saveNote('cours-1',{text:'À développer',base:null});
        const first=await store.load();check(first.library.courses[0].title==='Cours fictif','library retained');
        check(first.notes['cours-1'].text==='À développer','note retained');store.destroy();
      });
      await page.reload();
      await page.evaluate(async()=>{
        let account={user_id:'A',access_token:'fixture'};
        const a=EPPCSStore.create({userId:'A',getSession:()=>account});
        if((await a.load()).notes['cours-1'].text!=='À développer')throw Error('reload lost note');a.destroy();
        account={user_id:'B',access_token:'fixture'};
        const b=EPPCSStore.create({userId:'B',getSession:()=>account});
        if((await b.load()).library!==null)throw Error('account leak');b.destroy();
      });
    });
    await scenario('deux onglets : versions divergentes conservées',async page=>page.evaluate(async()=>{
      const one=EPPCSStore.create(options),two=EPPCSStore.create(options);
      await one.saveNote('cours-1',{text:'Version initiale',base:null});
      const base=(await two.load()).notes['cours-1'].base;
      await one.saveNote('cours-1',{text:'Modification onglet 1',base});
      await two.saveNote('cours-1',{text:'Modification onglet 2',base});
      let state=await two.load();check(state.conflicts.length===1,'conflict required');
      check(state.conflicts[0].local.text==='Modification onglet 2'&&state.conflicts[0].remote.text==='Modification onglet 1','both preserved');
      await two.resolveConflict('note:cours-1','local');state=await one.load();
      check(state.notes['cours-1'].text==='Modification onglet 2'&&!state.conflicts.length,'explicit choice');one.destroy();two.destroy();
    }));
    await scenario('import initial atomique : un seul onglet gagne et notes seules protégées',async page=>page.evaluate(async()=>{
      const one=EPPCSStore.create(options),two=EPPCSStore.create(options);
      const outcomes=await Promise.allSettled([
        one.importLibrary({name:'Bibliothèque premier onglet'},{requireEmpty:true}),
        two.importLibrary({name:'Bibliothèque second onglet'},{requireEmpty:true})
      ]);
      check(outcomes.filter(v=>v.status==='fulfilled').length===1&&outcomes.filter(v=>v.status==='rejected').length===1,'two initial imports both committed');
      const winner=outcomes.find(v=>v.status==='fulfilled').value.library.name;
      check((await one.load()).library.name===winner,'losing import overwrote winner');
      // The low-level default still allows an explicit library replacement.
      await one.importLibrary({name:'Remplacement explicite'});check((await two.load()).library.name==='Remplacement explicite','default import changed contract');
      one.destroy();two.destroy();account={user_id:'B',access_token:'B'};
      const notesOnly=EPPCSStore.create({...options,userId:'B'});
      await notesOnly.saveNote('cours-1',{text:'Note à conserver',base:null});
      let refused=false;try{await notesOnly.importLibrary(library,{requireEmpty:true})}catch{refused=true}
      const state=await notesOnly.load();check(refused&&!state.library&&state.notes['cours-1'].text==='Note à conserver','notes-only atelier overwritten');notesOnly.destroy();
    }));
    await scenario('avancement, date et base actualisée après chaque sauvegarde',async page=>page.evaluate(async()=>{
      const store=EPPCSStore.create(cloudOptions);
      let state=await store.saveNote('cours-1',{text:'Séance réalisée',status:'enseigne',savedAt:'2026-10-25T11:00:00.000Z',base:null});
      check(state.notes['cours-1'].status==='enseigne'&&state.notes['cours-1'].savedAt==='2026-10-25T11:00:00.000Z','metadata lost');
      const base=state.notes['cours-1'].base;
      state=await store.saveNote('cours-1',{text:'Bilan ajouté',status:'enseigne',savedAt:'2026-10-25T11:10:00.000Z',base});
      check(state.notes['cours-1'].base!==base&&!state.conflicts.length,'returned base unusable on second save');await store.sync();store.destroy();
      const reopened=EPPCSStore.create(cloudOptions);state=await reopened.load();
      check(state.notes['cours-1'].text==='Bilan ajouté'&&state.notes['cours-1'].status==='enseigne'&&state.notes['cours-1'].savedAt==='2026-10-25T11:10:00.000Z','reopening lost note metadata');
      check(remote.get('note:cours-1').payload.status==='enseigne','cloud omitted taught status');reopened.destroy();
    }));
    await scenario('échec du disque : aucune fausse sauvegarde',async page=>page.evaluate(async()=>{
      const store=EPPCSStore.create(options);await store.saveNote('cours-1',{text:'Original',base:null});
      const base=(await store.load()).notes['cours-1'].base,original=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(){throw new DOMException('Disk full','QuotaExceededError')};
      let rejected=false;try{await store.saveNote('cours-1',{text:'Non enregistré',base})}catch{rejected=true}finally{IDBObjectStore.prototype.put=original}
      check(rejected,'local save must reject');check((await store.load()).notes['cours-1'].text==='Original','previous value survives');store.destroy();
    }));
    await scenario('table absente : copie locale utilisable et message honnête',async page=>page.evaluate(async()=>{
      const store=EPPCSStore.create({...cloudOptions,fetch:async()=>new Response(JSON.stringify({code:'PGRST205'}),{status:404})});
      await store.importLibrary(library);await store.sync();
      const state=await store.load();check(state.library&&state.status.kind==='unavailable','must report local-only');check(state.status.pending===1,'must retain pending');store.destroy();
    }));
    await scenario('conflit serveur et résolution explicite sans gagnant temporel',async page=>page.evaluate(async()=>{
      const store=EPPCSStore.create(cloudOptions);await store.saveNote('cours-1',{text:'Initial',base:null});await store.sync();
      let state=await store.load();check(state.status.kind==='synced','initial synced');
      network=false;await store.saveNote('cours-1',{text:'Version téléphone',base:state.notes['cours-1'].base});await store.sync();
      remote.set('note:cours-1',{user_id:'A',document_id:'note:cours-1',revision:2,payload:{text:'Version ordinateur'}});network=true;
      await store.sync();state=await store.load();check(state.conflicts.length===1,'server conflict');
      check(state.conflicts[0].local.text==='Version téléphone'&&state.conflicts[0].remote.text==='Version ordinateur','two versions preserved');
      await store.resolveConflict('note:cours-1','local');await store.sync();
      check(remote.get('note:cours-1').payload.text==='Version téléphone','explicit local selected');store.destroy();
    }));
    await scenario('accusé tardif : une modification plus récente reste envoyée',async page=>page.evaluate(async()=>{
      let notify,release;const started=new Promise(r=>notify=r),held=new Promise(r=>release=r);let first=true;
      const send=fake;window.fake=async(...args)=>{const response=await send(...args);if(args[1]?.method==='POST'&&first){first=false;notify();await held}return response};
      const store=EPPCSStore.create(cloudOptions);await store.saveNote('cours-1',{text:'Première version',base:null});await started;
      const base=(await store.load()).notes['cours-1'].base;
      await store.saveNote('cours-1',{text:'Version plus récente',base});release();await store.sync();
      const state=await store.load();check(state.notes['cours-1'].text==='Version plus récente','late ACK replaced local content');
      check(remote.get('note:cours-1').payload.text==='Version plus récente','newer edit dropped from pending');
      check(calls.filter(c=>c.method==='POST').length===2,'exact two versions sent');store.destroy();
    }));
    await scenario('lecture tardive et renouvellement401 ne traversent pas les comptes',async page=>page.evaluate(async()=>{
      let release;const held=new Promise(r=>release=r);
      const store=EPPCSStore.create({...cloudOptions,fetch:async()=>{await held;return new Response(JSON.stringify([{user_id:'A',document_id:'library',revision:1,payload:library}]))}});
      const pending=store.sync().then(()=>false,e=>e.name==='AccountChangedError');account={user_id:'B',access_token:'B'};release();check(await pending,'account change must reject');store.destroy();
      const b=EPPCSStore.create({...options,userId:'B'});check((await b.load()).library===null,'A data in B');b.destroy();
      account={user_id:'A',access_token:'A'};let count=0;
      const expired=EPPCSStore.create({...cloudOptions,fetch:async()=>{count++;return new Response('{}',{status:401})},refreshSession:async()=>{account={user_id:'B',access_token:'B'};return true}});
      let rejected=false;try{await expired.sync()}catch(e){rejected=e.name==='AccountChangedError'}
      check(rejected&&count===1,'old payload retried with new user');expired.destroy();
    }));
    await scenario('sauvegarde sans jeton, restauration entière et effacement protégé',async page=>page.evaluate(async()=>{
      const store=EPPCSStore.create(options);await store.importLibrary(library);await store.saveNote('cours-1',{text:'Note',base:null});
      const backup=await store.exportBackup();check(!backup.includes('synthetic-token'),'secret exported');
      check(await EPPCSStore.hasPendingAllLocal(),'pending detected');let refused=false;try{await EPPCSStore.eraseAllLocal()}catch{refused=true}check(refused,'pending silently erased');
      store.destroy();await new Promise((r,j)=>{const req=indexedDB.deleteDatabase('eps-eppcs-v1-A');req.onsuccess=r;req.onerror=j});
      const restored=EPPCSStore.create(options);await restored.importBackup(backup);
      const state=await restored.load();check(state.library.courses[0].title==='Cours fictif'&&state.notes['cours-1'].text==='Note','backup incomplete');
      let duplicate=false;try{await restored.importBackup(backup)}catch{duplicate=true}check(duplicate,'restore overwrote existing atelier');restored.destroy();
      const online=EPPCSStore.create(cloudOptions);await online.sync();check(!(await EPPCSStore.hasPendingAllLocal()),'sync pending not cleared');
      await EPPCSStore.eraseAllLocal();check(!(await indexedDB.databases()).some(db=>db.name.startsWith('eps-eppcs-v1-')),'erase left database');
    }));
    await scenario('jsonb : ordre des propriétés sans faux conflit',async page=>page.evaluate(async()=>{
      const store=EPPCSStore.create(cloudOptions);await store.importLibrary({z:1,a:2});await store.sync();
      network=false;await store.importLibrary({z:1,a:2});await store.sync();
      remote.set('library',{user_id:'A',document_id:'library',revision:2,payload:{a:2,z:1}});network=true;await store.sync();
      check(!(await store.load()).conflicts.length,'JSONB key-order conflict');store.destroy();
    }));
    console.log(JSON.stringify({passed:pass.length,scenarios:pass}));
  }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
