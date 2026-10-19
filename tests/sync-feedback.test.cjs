const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const moduleSource = name => read(name).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const states = Object.fromEntries(['online','offline','syncing','pending','conflict','synced','error'].map(x=>[x.toUpperCase(),x]));

class Element {
  constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.dataset={};this.style={};this.listeners={};this.classList={toggle(){}};this.textContent='';}
  setAttribute(key,value){this.attributes[key]=value;}
  append(...children){children.forEach(child=>child.parent=this);this.children.push(...children);}
  appendChild(child){this.append(child);return child;}
  replaceChildren(...children){this.children=[];this.append(...children);}
  addEventListener(type,fn){this.listeners[type]=fn;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
}
function dom(){
  const body=new Element('body');
  return {body,createElement:tag=>new Element(tag),getElementById:id=>body.children.find(x=>x.id===id),addEventListener(){},querySelectorAll(){return []}};
}
function statusFixture(online=true){
  let listener;
  const context={document:dom(),navigator:{onLine:online},SYNC_STATE:states,subscribeSyncState:fn=>{listener=fn;return ()=>{};}};
  vm.runInNewContext(moduleSource('pwa/ui/sync-status.js')+'\nresult={describeSyncStatus,mountSyncStatus};',context);
  return {...context.result,document:context.document,emit:value=>listener(value)};
}

test('connection alone never says saved; pending and conflict override stale synced state',()=>{
  const {describeSyncStatus:describe}=statusFixture();
  assert.match(describe({state:'online'}).message,/vérification/);
  assert.doesNotMatch(describe({state:'online'}).label,/synchronisés/);
  for(const state of ['online','synced']){
    const pending=describe({state,pending:3});
    assert.equal(pending.state,'pending');assert.match(pending.message,/3 modifications conservées sur cet appareil/);
    const conflict=describe({state,pending:0,conflicts:1});
    assert.equal(conflict.state,'conflict');assert.match(conflict.message,/comparer les versions/);assert.equal(conflict.retry,false);
  }
  assert.match(describe({state:'synced'}).message,/saisie encore ouverte doit toujours être enregistrée/);
});
test('offline feedback promises only known queued saves, not unsaved form inputs',()=>{
  const {describeSyncStatus:describe}=statusFixture(false);
  const empty=describe({state:'offline',pending:0});
  assert.doesNotMatch(empty.message,/conservée/);assert.match(empty.message,/Utilisez Enregistrer/);assert.equal(empty.retry,false);
  const queued=describe({state:'synced',pending:2});
  assert.equal(queued.state,'offline');assert.match(queued.message,/automatiquement au retour du réseau/);assert.match(queued.message,/Ne ressaisissez pas/);
});
test('session error is actionable without exposing technical error text',()=>{
  const {describeSyncStatus:describe}=statusFixture();
  const value=describe({state:'error',pending:2,message:'401 JWT expired with secret=fixture-secret'});
  assert.match(value.message,/connexion à votre compte/);assert.match(value.message,/Ne supprimez pas/);
  assert.doesNotMatch(value.message,/JWT|fixture-secret|401/);
});
test('retry rejection is caught, button restored, and nontechnical guidance stays visible',async()=>{
  const fixture=statusFixture(),element=new Element('div');
  fixture.mountSyncStatus(element,{onRetry:async()=>{throw Error('SQL fixture-secret');}});
  fixture.emit({state:'pending',pending:2});
  const [,info,button]=element.children;
  assert.equal(button.hidden,false);
  await button.listeners.click({stopPropagation(){}});
  assert.equal(button.disabled,false);assert.equal(button.textContent,'Réessayer');
  assert.match(info.children[2].textContent,/vérification n’a pas abouti/);
  assert.doesNotMatch(info.children[2].textContent,/SQL|fixture-secret/);
  const noCallback=new Element('div');fixture.mountSyncStatus(noCallback);fixture.emit({state:'pending',pending:1});
  assert.equal(noCallback.children[2].hidden,true);
});

function indicatorFixture(){
  const dot=new Element('span'),document=dom();document.querySelectorAll=()=>[dot];
  const context={document,window:{addEventListener(){}},MutationObserver:class {observe(){}},alert(){}};
  vm.runInNewContext(read('tool-save-indicator.js'),context);
  return {save:context.EpsToolSave,dot};
}
test('failed save stays red even after unrelated successful synchronization',()=>{
  const {save,dot}=indicatorFixture();
  let token=save.begin();save.written(false);save.finish(token);assert.equal(save.colour(),'green');
  token=save.begin();save.failed();save.finish(token);
  assert.equal(save.colour(),'red');assert.match(dot.title,/Dernier enregistrement non confirmé/);
  save.sync({state:'synced',pending:0,conflicts:0});assert.equal(save.colour(),'red');
  token=save.begin();save.written(true);save.finish(token);assert.equal(save.colour(),'orange');
  save.sync({state:'synced',pending:0,conflicts:0});assert.equal(save.colour(),'green');
});
test('retained save with conflict asks for verification instead of promising automatic sending',()=>{
  const {save,dot}=indicatorFixture();const token=save.begin();save.written(true);save.finish(token);
  save.sync({state:'conflict',pending:0,conflicts:1});
  assert.equal(save.colour(),'orange');assert.match(dot.title,/Envoi à vérifier/);assert.doesNotMatch(dot.title,/reprendra/);
});
test('failure of an old screen save cannot contaminate the next screen',()=>{
  const {save}=indicatorFixture();const token=save.begin();save.reset();token.failed=true;save.finish(token);
  const next=save.begin();save.written(false);save.finish(next);assert.equal(save.colour(),'green');
});

function safetyFixture(){
  const listeners={},document=dom();
  vm.runInNewContext(read('sync-safety.js'),{document,window:{addEventListener:(type,fn)=>listeners[type]=fn}});
  return {document,emit:(type,event)=>listeners[type](event)};
}
test('local save failure gives recovery guidance and unrelated failures do not overwrite it',()=>{
  const fixture=safetyFixture();const error={name:'QuotaExceededError',message:'raw fixture-secret'};
  fixture.emit('eps:local-save-failed',{detail:{error}});
  const notice=fixture.document.getElementById('syncFailureNotice');
  assert.equal(notice.dataset.localSave,'true');assert.match(notice.children[1].textContent,/stockage.*plein/);
  assert.match(notice.children[1].textContent,/sans effacer les données EPS/);
  assert.doesNotMatch(notice.children[1].textContent,/fixture-secret/);
  fixture.emit('unhandledrejection',{reason:error});
  fixture.emit('unhandledrejection',{reason:Error('another failure')});
  assert.match(notice.children[1].textContent,/stockage.*plein/);
  notice.children[2].onclick();assert.equal(fixture.document.getElementById('syncFailureNotice'),undefined);
});
test('generic rejected action is not mislabeled as locally saved or definitively lost',()=>{
  const fixture=safetyFixture();fixture.emit('unhandledrejection',{reason:Error('SQL raw fixture-secret')});
  const notice=fixture.document.getElementById('syncFailureNotice');
  assert.equal(notice.dataset.localSave,'false');assert.equal(notice.children[0].textContent,'Une action n’a pas pu aboutir');
  assert.doesNotMatch(notice.children.map(x=>x.textContent).join(' '),/SQL|fixture-secret|perdu|conservée/);
});

async function bootstrapFixture(){
  const events=[],failure={error:null};let failed=0,changed=0;
  const context={document:{addEventListener(){}},window:{addEventListener(){},dispatchEvent:e=>events.push(e)},navigator:{onLine:false},location:{search:''},URLSearchParams,
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},setInterval(){},
    utiliserCompte(){},createSupabaseAdapter:()=>({}),OfflineSyncEngine:class {sync(){return Promise.resolve();}},
    createAutoSync:()=>({request:()=>Promise.resolve(),changed:()=>changed++}),startConnectivityMonitor(){},isOnline:()=>false,
    registerServiceWorker:()=>Promise.resolve(),subscribeSyncState(){},countPendingOperations:async()=>1,
    saveOfflineEdit:async()=>{if(failure.error)throw failure.error;return {changed:true};},
    saveOfflineDeletion:async()=>{if(failure.error)throw failure.error;return {changed:true};},
    EpsToolSave:{failed:()=>failed++},describeSyncStatus:statusFixture().describeSyncStatus};
  context.publishSyncState=(state,detail)=>events.push({type:'state',state,detail});
  vm.runInNewContext(moduleSource('pwa/bootstrap.js')+'\nresult=demarrerHorsConnexion;',context);
  const api=await context.result({session:()=>({user_id:'synthetic-account'})});
  return {api,events,failure,failed:()=>failed,changed:()=>changed};
}
test('local save and deletion failures notify truthfully, keep original error and never queue an orange acknowledgement',async()=>{
  const fixture=await bootstrapFixture();fixture.failure.error=Error('local fixture failure');
  for(const operation of [()=>fixture.api.enregistrer('fixture','1',{}),()=>fixture.api.supprimer('fixture','1')]){
    await assert.rejects(operation,error=>error===fixture.failure.error);
  }
  assert.equal(fixture.failed(),2);assert.equal(fixture.changed(),0);
  assert.equal(fixture.events.filter(e=>e.type==='eps:local-save-failed').length,2);
  assert.equal(fixture.events.filter(e=>e.type==='state').length,0);
  fixture.failure.error=null;await fixture.api.enregistrer('fixture','1',{});
  assert.equal(fixture.changed(),1);assert.equal(fixture.events.at(-1).state,'offline');
});

test('the visible settings panel shares truthful pending and error feedback',()=>{
  const elements=Object.fromEntries(['settingsSyncDetails','settingsSyncError','settingsSyncGuidance','settingsSyncConflicts','connectionIssueNotice'].map(id=>[id,new Element('p')]));
  const summary=new Element('summary');summary.classList.add=()=>{};summary.querySelector=()=>summary.children[0];
  const source=read('offline-preparation.js');
  const context={document:{getElementById:id=>elements[id],querySelector:selector=>selector.startsWith('#accountSection')?summary:null,createElement:tag=>new Element(tag)},
    session:{user_id:'fixture'},settingsSyncDetail:{state:'synced',pending:2},automaticOfflineState:'ready',automaticOfflineMessage:'Ready',EpsSyncFeedback:{describe:statusFixture().describeSyncStatus}};
  vm.runInNewContext(source.slice(source.indexOf('function renderConnectionSettings'),source.indexOf('function showOfflinePreparationState')),context);
  context.renderConnectionSettings();
  assert.equal(summary.children[0].dataset.state,'waiting');assert.match(elements.settingsSyncGuidance.textContent,/2 modifications conservées/);
  context.settingsSyncDetail={state:'error',pending:2,message:'401 secret JWT value'};context.renderConnectionSettings();
  assert.equal(summary.children[0].dataset.state,'error');assert.equal(elements.settingsSyncError.hidden,false);
  assert.match(elements.settingsSyncError.textContent,/connexion à votre compte/);assert.doesNotMatch(elements.settingsSyncError.textContent,/secret|401|JWT/);
});
test('the visible settings retry catches a rejection and restores its button',async()=>{
  const button=new Element('button'),box=new Element('p'),source=read('teacher-settings.js');
  const context={document:{getElementById:id=>id==='settingsSyncRetry'?button:box},session:{user_id:'fixture'},navigator:{onLine:true},
    demarrerModeHorsConnexion:async()=>({synchroniser:async()=>{throw Error('SQL raw fixture');}})};
  vm.runInNewContext(source.slice(source.indexOf('  async function retrySettingsSync'),source.indexOf('  async function openSettings')),context);
  await context.retrySettingsSync();assert.equal(button.disabled,false);assert.equal(box.hidden,false);
  assert.match(box.textContent,/Ne supprimez pas les données/);assert.doesNotMatch(box.textContent,/SQL raw/);
  assert.equal(button.textContent,'Réessayer la synchronisation');
});
