const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const source=fs.readFileSync(path.resolve(__dirname,'../compte.js'),'utf8');
const helper=source.slice(source.indexOf('async function verifierAtelierEPPCSAvantDeconnexion('),source.indexOf('async function deconnecterEnSecurite()'));
function fixture({draft=false,pending=0,conflicts=[],otherPending=false,online=true}={}){
  const calls=[],alerts=[];
  const context={session:{user_id:'A'},navigator:{onLine:online},alert:message=>alerts.push(message),
    EPSAtelierEPPCS:{hasUnsavedDraft:()=>draft,sync:async()=>calls.push('sync'),getState:()=>({status:{pending:0},conflicts:[]})},
    EPPCSStore:{create:({userId})=>{assert.equal(userId,'A');calls.push('read-current');return{load:async()=>({status:{pending},conflicts}),destroy:()=>calls.push('close-reader')}},hasPendingAllLocal:async()=>{calls.push('read-all');return otherPending}}};
  vm.createContext(context);vm.runInContext(helper,context);return{context,calls,alerts};
}
test('EPPCS : brouillon non enregistré empêche la déconnexion avant tout envoi',async()=>{
  const f=fixture({draft:true});assert.equal(await f.context.verifierAtelierEPPCSAvantDeconnexion(),false);
  assert.deepEqual(f.calls,[]);assert.match(f.alerts[0],/Enregistrer mes notes/);
});
test('EPPCS : la copie persistée courante prévaut sur un voyant périmé',async()=>{
  const f=fixture({pending:1});assert.equal(await f.context.verifierAtelierEPPCSAvantDeconnexion(),false);
  assert.deepEqual(f.calls,['read-current','close-reader','sync','read-current','close-reader']);assert.match(f.alerts[0],/conservées sur cet appareil/);
});
test('EPPCS : aucun envoi à la déconnexion d’un compte sans atelier',async()=>{
  const f=fixture();f.context.EPSAtelierEPPCS.sync=async()=>{throw Error('Une requête ne devait pas partir')};
  assert.equal(await f.context.verifierAtelierEPPCSAvantDeconnexion(),true);
  assert.deepEqual(f.calls,['read-current','close-reader']);
});
test('EPPCS : déconnexion hors connexion vérifie sans tenter le réseau',async()=>{
  const f=fixture({online:false});assert.equal(await f.context.verifierAtelierEPPCSAvantDeconnexion(),true);
  assert.deepEqual(f.calls,['read-current','close-reader']);
});
test('EPPCS : un autre compte bloque seulement l’effacement global',async()=>{
  const f=fixture({otherPending:true});assert.equal(await f.context.verifierAtelierEPPCSAvantDeconnexion(),true);
  assert(!f.calls.includes('read-all'));assert.equal(await f.context.verifierAtelierEPPCSAvantDeconnexion(true),false);
  assert.match(f.alerts[0],/Aucune copie n’a été effacée/);
});
test('EPPCS : toutes les vérifications précèdent les effacements et auth efface la vue',()=>{
  const erase=source.slice(source.indexOf('async function deconnecterEtEffacerCetAppareil()'),source.indexOf('function showAuthView()'));
  assert(erase.indexOf('verifierAtelierEPPCSAvantDeconnexion(true)')<erase.indexOf('eraseAllLocal()'));
  assert(erase.indexOf('verifierAtelierEPPCSAvantDeconnexion(true)')<erase.indexOf('oublierDonneesLocales()'));
  assert(erase.indexOf('if (pending || conflicts)')<erase.indexOf('eraseAllLocal()'));
  assert.match(source,/function showAuthView\(\)\s*\{\s*globalThis\.EPSAtelierEPPCS\?\.reset\?\.\(\)/);
});
