import { STORES, DB_VERSION, recordKey } from '../core/constants.js';
import { transaction, requestResult, generationLocale, marquerEffacement } from './database.js';

const stores = Object.values(STORES);
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
  .map(n => n.toString(16).padStart(2, '0')).join('');
const keys = { records:'key', outbox:'opId', conflicts:'conflictId' };

export async function exportLocalBackup(owner, entities) {
  if (!owner) throw Error('Connectez-vous avant de sauvegarder.');
  const generation = generationLocale();
  const data = await transaction(stores, 'readonly', s => Promise.all(stores.map(async name => [name, await requestResult(s[name].getAll())])));
  if (generation !== generationLocale()) throw Error('Le compte a changé pendant la sauvegarde.');
  const values = Object.fromEntries(data);
  // Cursors, roles, readiness claims and device identities must not be transferred.
  values.meta = values.meta.filter(r => r.key.startsWith('resolved-conflict:'));
  const preferences = {};
  const prefKey = `eps_teacher_preferences:${owner}`;
  const raw = localStorage.getItem(prefKey);
  if (raw) { const prefs = JSON.parse(raw); delete prefs.pin; preferences[prefKey] = JSON.stringify(prefs); }
  const draftKey=`eps_tool_resume:${owner}`, draft=localStorage.getItem(draftKey);
  if(draft && JSON.parse(draft).owner===owner)preferences[draftKey]=draft;
  const payload = { ownerId:owner, databaseVersion:DB_VERSION, exportedAt:new Date().toISOString(), entities:[...entities], stores:values, preferences };
  const envelope = { format:'eps-lvh-web-local', version:1, sha256:await digest(JSON.stringify(payload)), payload };
  return JSON.stringify(envelope);
}

export async function validateLocalBackup(json, owner, entities) {
  if (new TextEncoder().encode(json).length > 100 * 1024 * 1024) throw Error('Fichier trop volumineux.');
  const root=JSON.parse(json), p=root.payload;
  if (root.format!=='eps-lvh-web-local' || root.version!==1 || !p || p.databaseVersion!==DB_VERSION)
    throw Error('Ce fichier n’est pas une sauvegarde locale site/PWA compatible. Une sauvegarde Android se restaure dans l’APK.');
  if (!owner || p.ownerId!==owner) throw Error('Cette sauvegarde appartient à un autre compte.');
  if (root.sha256!==await digest(JSON.stringify(p))) throw Error('Fichier incomplet ou altéré.');
  if (!p.stores || Object.keys(p.stores).sort().join()!==stores.slice().sort().join()) throw Error('Sauvegarde incomplète.');
  const allowed=new Set(entities);
  for (const name of stores) {
    if (!Array.isArray(p.stores[name])) throw Error('Rubrique invalide.');
    const seen=new Set();
    for (const row of p.stores[name]) {
      const key=row?.[keys[name] || 'key'];
      if (typeof key!=='string' || !key || seen.has(key)) throw Error('Identifiant absent ou dupliqué.');
      seen.add(key);
      if (name==='meta') { if (!key.startsWith('resolved-conflict:')) throw Error('Métadonnée non portable.'); continue; }
      if (!allowed.has(row.entity) || typeof row.id!=='string') throw Error('Rubrique inconnue de cette version du site.');
      const expected=recordKey(row.entity,row.id);
      if ((name==='records'?row.key:row.recordKey)!==expected) throw Error('Référence de fiche invalide.');
      if (name==='outbox') {
        if (row.authorId!==owner || !['upsert','delete'].includes(row.action) || !Number.isInteger(row.baseVersion) || row.baseVersion<0)
          throw Error('Une saisie en attente appartient à un autre compte ou est invalide.');
        if (!Array.isArray(row.changedFields) || row.changedFields.some(k=>typeof k!=='string' || ['__proto__','constructor','prototype'].includes(k))) throw Error('Champs de saisie invalides.');
      }
    }
  }
  const prefs=p.preferences || {};
  for (const key of Object.keys(prefs)) {
    if (![ `eps_teacher_preferences:${owner}`, `eps_tool_resume:${owner}` ].includes(key) || typeof prefs[key]!=='string') throw Error('Réglage non autorisé.');
    const v=JSON.parse(prefs[key]);
    if (!v || typeof v!=='object' || Array.isArray(v) || Object.hasOwn(v,'pin')) throw Error('Réglage non portable.');
    if(key===`eps_tool_resume:${owner}`&&(v.owner!==owner||v.kind!=='running-draft'||!v.payload||typeof v.payload.values!=='object'||!Array.isArray(v.payload.groups)))throw Error('Brouillon invalide ou appartenant à un autre compte.');
  }
  return p;
}

/** Caller holds the engine's exclusive lock. Strict durability, all stores in one transaction. */
export async function restoreLocalBackup(json, owner, entities) {
  const p=await validateLocalBackup(json,owner,entities);
  const generation=generationLocale();
  const prefKey=`eps_teacher_preferences:${owner}`;
  const oldPref=localStorage.getItem(prefKey);
  const draftKey=`eps_tool_resume:${owner}`,oldDraft=localStorage.getItem(draftKey);
  const existing=await transaction([STORES.OUTBOX,STORES.CONFLICTS], 'readonly', s => Promise.all([
    requestResult(s[STORES.OUTBOX].count()),requestResult(s[STORES.CONFLICTS].count())
  ]));
  if (existing.some(n=>n>0)) throw Error('Cet appareil a des saisies ou conflits à conserver. Sauvegardez-les et traitez-les avant de restaurer.');
  if (generation!==generationLocale()) throw Error('Le compte a changé.');
  try {
    if(p.preferences[draftKey])localStorage.setItem(draftKey,p.preferences[draftKey]);
    if (p.preferences[prefKey]) {
      const next=JSON.parse(p.preferences[prefKey]);
      const pin=oldPref ? JSON.parse(oldPref).pin : undefined;
      if (pin) next.pin=pin; // Never import a PIN or disable this device’s current PIN.
      localStorage.setItem(prefKey,JSON.stringify(next));
    }
    await transaction(stores,'readwrite',(s, tx)=>{
      if (generation!==generationLocale()) { tx.abort(); throw Error('Le compte a changé.'); }
      stores.forEach(name=>{s[name].clear();p.stores[name].forEach(row=>s[name].put(row));});
    }, 'strict');
  } catch(e) {
    if(oldDraft===null)localStorage.removeItem(draftKey);else localStorage.setItem(draftKey,oldDraft);
    if(oldPref===null)localStorage.removeItem(prefKey);else localStorage.setItem(prefKey,oldPref);
    throw e;
  }
  marquerEffacement();
  return {records:p.stores.records.length,pending:p.stores.outbox.length};
}
