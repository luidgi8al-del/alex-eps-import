const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'eppcs.js'), 'utf8');
const library = {courses:[{id:'chapitre-1',number:1,title:'Sédentarité — exemple fictif',theme:'Santé',question:'Question fictive',sessions:[],sections:[],quizzes:[],privateBody:'Ne doit pas être renvoyé'}],controls:[],sources:[]};
const plain = value => JSON.parse(JSON.stringify(value));

function controller({local = library, load, remote = null, online = true} = {}) {
  const calls = [], state = {library,notes:{},conflicts:[],status:{message:'Copie locale',kind:'local'}};
  const nodes = new Map();
  function node() { return {innerHTML:'',textContent:'',dataset:{},classList:{add(){}},replaceChildren(){},querySelector(selector){return nodes.get(selector) || null;}}; }
  const target = node(), content = node();
  nodes.set('[data-eppcs-content]', content); nodes.set('[data-eppcs-status]', node());
  nodes.set('[data-eppcs-message]', node()); nodes.set('[data-eppcs-conflicts]', node());
  const context = vm.createContext({session:{user_id:'A'},SUPABASE_URL:'https://example.invalid',SUPABASE_KEY:'public-key',navigator:{onLine:online},
    EPPCSStore:{readLocalLibrary:async user => {calls.push(['local',user]);return typeof local === 'function' ? local() : local;},create:({userId}) => {calls.push(['create',userId]);return {
      load:load || (async()=>state),sync:async()=>{calls.push(['sync']);},destroy(){calls.push(['destroy-store']);}
    };}},
    EPPCSView:{mount(){calls.push(['mount']);return{openChapter:id=>{calls.push(['open',id]);return id==='chapitre-1';},destroy(){calls.push(['destroy-view']);},hasUnsavedDraft:()=>true};}},
    renouvelerSession:async()=>true,
    apiFetch:async(...args)=>{calls.push(['fetch',...args]);return{ok:true,json:async()=>remote===null?[]:[{payload:remote}]};},
    addEventListener(){},showTab:(...args)=>calls.push(['tab',...args]),initCoursTab:options=>calls.push(['init',options])
  });
  context.window = context;
  vm.runInContext(source,context);
  context.showCoursTab = async name => {calls.push(['subtab',name]);await context.EPSAtelierEPPCS.open(target);};
  return {context,calls,target,state,api:context.EPSAtelierEPPCS};
}

test('recherche EPPCS locale : métadonnées seules, aucun store créé et aucun envoi', async()=>{
  const f=controller();
  const rows=plain(await f.api.searchChapters());
  assert.deepEqual(rows,[{id:'chapitre-1',title:library.courses[0].title,theme:'Santé',question:'Question fictive',number:1}]);
  assert.deepEqual(f.calls,[['local','A']]);
});
test('recherche EPPCS : compte changé pendant la lecture ne laisse aucun ancien résultat', async()=>{
  let release;
  const f=controller({local:()=>new Promise(resolve=>{release=resolve;})});
  const pending=f.api.searchChapters();f.context.session={user_id:'B'};release(library);
  assert.deepEqual(plain(await pending),[]);
  assert(!f.calls.some(call=>call[0]==='fetch'));
});
test('recherche EPPCS annulée : la lecture tardive ne publie rien et ne contacte pas le serveur', async()=>{
  let current=true,release;
  const f=controller({local:()=>new Promise(resolve=>{release=resolve;})});
  const pending=f.api.searchChapters({isCurrent:()=>current});current=false;release(null);
  assert.deepEqual(plain(await pending),[]);
  assert(!f.calls.some(call=>call[0]==='fetch'));
});
test('recherche EPPCS nouvel appareil : GET limité au propriétaire et à la bibliothèque',async()=>{
  const f=controller({local:null,remote:library});
  assert.equal((await f.api.searchChapters()).length,1);
  const request=f.calls.find(call=>call[0]==='fetch');
  const url=new URL(request[1]);
  assert.equal(url.searchParams.get('user_id'),'eq.A');
  assert.equal(url.searchParams.get('document_id'),'eq.library');
  assert.equal(url.searchParams.get('select'),'payload');
  assert.equal(request.length,2,'GET defaults, no mutation method/body');
  assert(!f.calls.some(call=>['create','sync','mount'].includes(call[0])));
});
test('recherche EPPCS hors connexion sans bibliothèque : aucun appel réseau',async()=>{
  const f=controller({local:null,remote:library,online:false});
  assert.deepEqual(plain(await f.api.searchChapters()),[]);
  assert.deepEqual(f.calls,[['local','A']]);
});
test('ouvrir un chapitre attend la vue, réutilise celle existante et garde ses brouillons',async()=>{
  const f=controller();
  assert.equal(await f.api.openChapter('chapitre-1'),true);
  assert.equal(await f.api.openChapter('chapitre-1'),true);
  assert.equal(f.calls.filter(call=>call[0]==='mount').length,1);
  assert.equal(f.calls.filter(call=>call[0]==='open').length,2);
  assert(!f.calls.some(call=>call[0]==='destroy-view'));
  assert.equal(f.api.hasUnsavedDraft(),true);
  assert.equal(f.calls.find(call=>call[0]==='tab')[2].skipModuleStart,true);
});
test('ouvrir un chapitre : une destination périmée n’ouvre pas le chapitre après chargement',async()=>{
  let release,current=true;
  const f=controller({load:()=>new Promise(resolve=>{release=resolve;})});
  const pending=f.api.openChapter('chapitre-1',{isCurrent:()=>current});current=false;release(f.state);
  assert.equal(await pending,false);
  assert(!f.calls.some(call=>call[0]==='open'));
});
test('ouvrir un chapitre : un compte changé avant fin de chargement ne voit pas le chapitre',async()=>{
  let release;
  const f=controller({load:()=>new Promise(resolve=>{release=resolve;})});
  const pending=f.api.openChapter('chapitre-1');f.api.reset();f.context.session={user_id:'B'};release(f.state);
  assert.equal(await pending,false);
  assert(!f.calls.some(call=>call[0]==='open'));
});
test('ouvrir un chapitre : une navigation refusée ne crée ni vue ni atelier',async()=>{
  const f=controller();f.context.showTab=()=>false;
  assert.equal(await f.api.openChapter('chapitre-1'),false);
  assert.deepEqual(f.calls,[]);
});

function coursesFixture({afterLoad = ()=>{}}={}) {
  const text=fs.readFileSync(path.join(root,'cours.js'),'utf8');
  const fn=text.slice(text.indexOf('async function openCourseFromSearch('),text.indexOf('function apsaOptionsHtml('));
  const calls=[],course={id:'cycle-B',classRow:{name:'Classe fictive'},period_number:3};
  const context=vm.createContext({session:{user_id:'A'},loadedCourses:[{id:'stale'}],selectedCoursPeriod:1,
    document:{querySelectorAll:()=>[]},showTab:(...args)=>calls.push(['tab',...args]),
    initCoursTab:options=>calls.push(['init',options]),showCoursTab:async()=>{context.loadedCourses=[course];afterLoad(context);},
    planningClassLabel:c=>c.name,planningText:value=>value,renderCreatedCourses:()=>calls.push(['render']),
    openCreatedCourse:async(...args)=>{calls.push(['open',...args]);return true;}
  });
  vm.runInContext(fn,context);return {context,calls};
}
test('recherche cours : ouverture du cycle exact et de sa période, pas seulement de la rubrique',async()=>{
  const f=coursesFixture();assert.equal(await f.context.openCourseFromSearch('cycle-B'),true);
  assert.equal(f.context.selectedCoursPeriod,3);assert.equal(f.calls.find(call=>call[0]==='open')[1].id,'cycle-B');
  assert.equal(f.calls.find(call=>call[0]==='init')[1].deferInitialView,true);
});
test('recherche cours : un résultat supprimé ou un compte changé n’ouvre jamais un ancien cycle',async()=>{
  const f=coursesFixture();assert.equal(await f.context.openCourseFromSearch('stale'),false);
  const swapped=coursesFixture({afterLoad:context=>{context.session={user_id:'B'};}});
  assert.equal(await swapped.context.openCourseFromSearch('cycle-B'),false);
  assert(!swapped.calls.some(call=>call[0]==='open'));
});
test('recherche cours : une navigation refusée ne charge ni ne remplace aucun cycle',async()=>{
  const f=coursesFixture();f.context.showTab=()=>false;
  assert.equal(await f.context.openCourseFromSearch('cycle-B'),false);
  assert.equal(f.context.loadedCourses[0].id,'stale');
  assert.deepEqual(f.calls,[]);
});

function readOnlyStorage({registered=[],exists=false}={}) {
  const calls=[],name='eps-eppcs-v1-A';
  const db={objectStoreNames:{contains:value=>value==='records'},close(){calls.push(['close']);},
    transaction(store,mode){
      calls.push(['transaction',store,mode]);
      const tx={objectStore(){return{get(key){calls.push(['get',key]);const req={result:{payload:library}};queueMicrotask(()=>tx.oncomplete());return req;}};}};
      return tx;
    }};
  const context=vm.createContext({TextEncoder,
    localStorage:{getItem:()=>JSON.stringify(registered),setItem(){throw Error('Search must not write the registry');}},
    indexedDB:{databases:async()=>exists?[{name}]:[],open(value){
      calls.push(['open',value]);const req={result:db,transaction:{abort(){calls.push(['abort-creation']);queueMicrotask(()=>req.onerror());}}};
      queueMicrotask(()=>exists?req.onsuccess():req.onupgradeneeded());return req;
    }}
  });
  vm.runInContext(fs.readFileSync(path.join(root,'eppcs-store.js'),'utf8'),context);
  return{calls,api:context.EPPCSStore};
}
test('index local EPPCS : aucune base créée pour un compte sans atelier',async()=>{
  const f=readOnlyStorage();assert.equal(await f.api.readLocalLibrary('A'),null);assert.deepEqual(f.calls,[]);
});
test('index local EPPCS : un ancien nom de base supprimée ne recrée pas l’atelier',async()=>{
  const f=readOnlyStorage({registered:['eps-eppcs-v1-A']});
  assert.equal(await f.api.readLocalLibrary('A'),null);
  assert.deepEqual(f.calls,[['open','eps-eppcs-v1-A'],['abort-creation']]);
});
test('index local EPPCS : lecture de la bibliothèque seule dans une transaction readonly fermée',async()=>{
  const f=readOnlyStorage({exists:true});
  assert.deepEqual(plain(await f.api.readLocalLibrary('A')),library);
  assert.deepEqual(f.calls,[['open','eps-eppcs-v1-A'],['transaction','records','readonly'],['get','library'],['close']]);
});

function bootstrapCourse({deleted=false}={}) {
  const calls=[],course={id:'cycle-B',class_id:'class-B',apsa_name:'Volley',grade:'SECONDE',session_count:8};
  const remote={cycles:[course],classes:[{id:'class-B',name:'2nde4'}],class_schedule_slots:[{id:'slot-B',class_id:'class-B'}],
    period_activities:[{slot_id:'slot-B',period_number:3,apsa_name:'Volley'}]};
  const context=vm.createContext({session:{user_id:'A'},automaticOfflineState:'preparing',navigator:{onLine:true},SUPABASE_URL:'https://example.invalid',
    loadedCourses:[],selectedCoursPeriod:1,document:{getElementById:()=>({innerHTML:''}),querySelectorAll:()=>[]},
    lireTable:async()=>[],modeHorsConnexion:{adapter:{tables:Object.keys(remote)},lire:async table=>({rows:table==='cycles'&&deleted?[{...course,deleted:true}]:[]})},
    apiFetch:async(url,options)=>{calls.push(['request',url,options]);return{ok:true,json:async()=>remote[new URL(url).pathname.split('/').pop()]||[]};},
    showTab:()=>true,initCoursTab(){},renderCreatedCourses(){},planningClassLabel:c=>c.name,planningText:value=>value,
    openCreatedCourse:async(row,label)=>{calls.push(['open',row,label]);return true;}
  });
  const entities=fs.readFileSync(path.join(root,'classes.js'),'utf8');
  vm.runInContext(entities.slice(entities.indexOf('globalThis.EPSGlobalSearchRead ='),entities.indexOf('/** Navigation de recherche :')),context);
  const classes=fs.readFileSync(path.join(root,'classe-tableau-bord.js'),'utf8');
  vm.runInContext(classes.slice(classes.indexOf('async function loadCycles('),classes.indexOf('function renderCreatedCourses(')),context);
  context.showCoursTab=async(name,options)=>context.loadCycles(options);
  const courses=fs.readFileSync(path.join(root,'cours.js'),'utf8');
  vm.runInContext(courses.slice(courses.indexOf('async function openCourseFromSearch('),courses.indexOf('function apsaOptionsHtml(')),context);
  return{context,calls};
}
test('recherche cours pendant préparation : cache vide mais cible autorisée reste ouvrable sans écriture',async()=>{
  const f=bootstrapCourse();assert.equal(await f.context.openCourseFromSearch('cycle-B'),true);
  const opened=f.calls.find(call=>call[0]==='open');assert.equal(opened[1].id,'cycle-B');assert.equal(opened[2],'2nde4');
  assert.equal(f.context.selectedCoursPeriod,3);
  const requests=f.calls.filter(call=>call[0]==='request');
  assert(requests.every(call=>call[2]===undefined),'No write method or body');
  const cycleURL=new URL(requests.find(call=>new URL(call[1]).pathname.endsWith('/cycles'))[1]);
  assert.equal(cycleURL.searchParams.get('id'),'eq.cycle-B','Only the selected cycle is reread');
});
test('recherche cours pendant préparation : suppression locale conservée, aucun ancien cycle recréé',async()=>{
  const f=bootstrapCourse({deleted:true});assert.equal(await f.context.openCourseFromSearch('cycle-B'),false);
  assert(!f.calls.some(call=>call[0]==='open'));
  assert(!f.calls.some(call=>call[0]==='request'&&new URL(call[1]).pathname.endsWith('/cycles')));
});
