/* Readiness requires both public resources and account data. */
function offlineWorkerRequest(type, onProgress) {
  return new Promise((resolve,reject) => {
    const worker = navigator.serviceWorker?.controller;
    if (!worker) return reject(Error("Rechargez la page une fois pour activer le mode hors connexion."));
    const channel = new MessageChannel();
    let timer;
    const stop = () => { clearTimeout(timer); channel.port1.close(); };
    const arm = () => { clearTimeout(timer); timer=setTimeout(()=>{stop();reject(Error("La préparation a été interrompue. Réessayez avec une connexion stable."));},60000); };
    arm();
    channel.port1.onmessage = ({data}) => {
      arm();
      if (data.error) {stop();reject(Error(data.error));}
      else if (data.done || typeof data.ready === "boolean") {stop();resolve(data);}
      else onProgress?.(data);
    };
    worker.postMessage({type},[channel.port2]);
  });
}
async function offlinePreparationStatus() {
  const engine = await demarrerModeHorsConnexion();
  if (!engine) return "Le stockage hors connexion n’est pas disponible sur cet appareil.";
  const {getMeta} = await import('./pwa/storage/database.js');
  const saved = await getMeta('offline-preparation');
  if (!saved || saved.userId !== session?.user_id) return "Appareil à préparer avec une connexion Internet.";
  const check = await offlineWorkerRequest('CHECK_OFFLINE');
  if (!check.ready || check.version !== saved.version) return "Les outils ont été mis à jour ou le cache a été vidé : préparez à nouveau cet appareil.";
  return `Copie hors connexion préparée le ${new Date(saved.at).toLocaleString('fr-FR')}. Les données disponibles correspondent aux dernières synchronisations réussies.`;
}
async function prepareOfflineDevice(progress = () => {}) {
  if (!navigator.onLine) throw Error("Connectez cet appareil à Internet pour télécharger les outils et les données.");
  const owner = session?.user_id;
  if (!owner) throw Error("Connectez-vous d’abord avec votre compte enseignant.");
  const engine = await demarrerModeHorsConnexion();
  if (!engine) throw Error("Le stockage hors connexion n’est pas disponible.");
  const {setMeta} = await import('./pwa/storage/database.js');
  await setMeta('offline-preparation',null);
  progress("Téléchargement des outils…");
  const cachedAssets = await offlineWorkerRequest('CHECK_OFFLINE');
  const assets = cachedAssets.ready ? cachedAssets : await offlineWorkerRequest('PREPARE_OFFLINE', d => progress(`Téléchargement des outils : ${d.progress} / ${d.total}`));
  progress("Téléchargement des données de votre compte…");
  for (const path of ['rpc/eps_as_roster_version','eps_schema_marks?name=eq.as_slot_assignments&select=name','eps_schema_marks?name=eq.as_creneaux&select=name']) {
    const response = await apiFetch(`${SUPABASE_URL}/rest/v1/${path}`);
    if (!response.ok) throw Error("La préparation des rubriques AS a échoué. Réessayez avant de partir sans réseau.");
    const value = await response.json();
    if (path.startsWith('rpc/') ? !(Number(value) >= 2) : !Array.isArray(value) || !value.length) {
      throw Error("Les rubriques AS nécessitent une mise à jour du serveur avant de préparer le hors connexion.");
    }
  }
  const success = await engine.synchroniser();
  if (session?.user_id !== owner) throw Error("Le compte a changé : recommencez la préparation sur le compte souhaité.");
  if (!success) throw Error("Les outils sont téléchargés, mais les données ne sont pas entièrement synchronisées. Réessayez avant de partir sans réseau.");
  const {currentSyncState} = await import('./pwa/core/events.js');
  if (currentSyncState().conflicts || currentSyncState().pending) throw Error("Des modifications ou conflits restent à traiter dans le bandeau de synchronisation. Réglez-les puis relancez la préparation.");
  const extended = TABLES_HORS_CONNEXION_VAGUE_2.every(t=>engine.adapter.tables.includes(t));
  if (!extended) throw Error("Les classes sont disponibles, mais le serveur n’a pas encore activé le hors connexion AS, santé et programmation. Préparation complète non confirmée.");
  // Profile and establishment are needed for navigation after restarting offline.
  await loadInstitution();
  if (rattachementIncertain) throw Error("L’établissement n’a pas pu être vérifié. Réessayez avec une connexion stable.");
  await loadTeamContext();
  if (session?.user_id !== owner) throw Error("Le compte a changé pendant la préparation.");
  const persisted = await navigator.storage?.persist?.().catch(()=>false);
  await setMeta('offline-preparation',{userId:owner,at:new Date().toISOString(),version:assets.version});
  progress("Appareil préparé : outils et données synchronisées accessibles sans connexion." + (!persisted ? " Le navigateur peut libérer ce stockage ; vérifiez cet état avant de partir." : ""));
}

let automaticOfflineRun = null;
let automaticOfflineOwner = null;
let automaticOfflineLastCheck = 0;
let automaticOfflineRetry = null;
let automaticOfflineFailures = 0;
let automaticOfflineMessage = "Vérification du mode hors connexion…";
let automaticOfflineState = 'preparing';
let settingsSyncDetail = {};
function renderConnectionSettings() {
  const sync = settingsSyncDetail;
  const syncError = sync.state === 'error' || Number(sync.conflicts) > 0 || sync.state === 'conflict';
  const offlineError = automaticOfflineState === 'error';
  const indicators = [
    ['offlineSection', automaticOfflineState, automaticOfflineMessage],
    ['accountSection', syncError ? 'error' : sync.state === 'synced' ? 'ready' : 'waiting',
      syncError ? 'Synchronisation à vérifier' : sync.state === 'synced' ? 'Tout est synchronisé' : 'Synchronisation en attente ou en cours']
  ];
  for (const [id,state,message] of indicators) {
    const summary = document.querySelector(`#${id} > summary`);
    if (!summary) continue;
    summary.classList.add('settingsSummaryWithStatus');
    let dot = summary.querySelector('.settingsStateDot');
    if (!dot) { dot=document.createElement('span');dot.className='settingsStateDot';dot.setAttribute('role','img');summary.append(dot); }
    dot.dataset.state=state;dot.title=message;dot.setAttribute('aria-label',message);
  }
  const offlineText = document.getElementById('offlinePreparationStatus');
  if (offlineText) { offlineText.textContent=automaticOfflineMessage;offlineText.hidden=!offlineError; }
  const button = document.getElementById('prepareOfflineBtn');
  if (button) button.disabled=automaticOfflineState==='preparing';
  const info=document.getElementById('settingsSyncDetails');
  if (info) {
    const date=sync.lastSuccessfulAt ? new Date(sync.lastSuccessfulAt).toLocaleString('fr-FR') : 'pas encore effectuée';
    info.textContent=`Dernière synchronisation réussie : ${date}. ${Number(sync.pending)||0} modification(s) en attente · ${Number(sync.conflicts)||0} conflit(s).`;
  }
  const syncMessage=document.getElementById('settingsSyncError');
  if (syncMessage) { syncMessage.hidden=!syncError;syncMessage.textContent=sync.message || 'Vérifiez les conflits et réessayez la synchronisation.'; }
  const conflicts=document.getElementById('settingsSyncConflicts');
  if (conflicts) conflicts.hidden=!Number(sync.conflicts);
  const notice=document.getElementById('connectionIssueNotice');
  if (notice) {
    notice.hidden=!session || !(syncError || offlineError);
    const section=syncError ? 'Compte web / synchronisation' : 'Utiliser sans connexion';
    const message=`Un problème est à vérifier dans Réglage → ${section}.`;
    if (notice.textContent!==message) notice.textContent=message;
    notice.onclick=async()=>{await openSettings();document.getElementById(syncError?'accountSection':'offlineSection')?.scrollIntoView({block:'center',behavior:'smooth'});};
  }
}
function showOfflinePreparationState(state, message, owner) {
  if (session?.user_id !== owner) return;
  automaticOfflineMessage = message;
  automaticOfflineState = state;
  const status = document.getElementById('offlinePreparationStatus');
  if (status) { status.textContent = message; status.dataset.state = state; }
  const retry = document.getElementById('prepareOfflineBtn');
  if (retry) retry.disabled = state === 'preparing';
  renderConnectionSettings();
}
function waitForOfflineWorker() {
  if (navigator.serviceWorker?.controller) return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const worker = navigator.serviceWorker;
    if (!worker) return reject(Error("Ce navigateur ne permet pas la préparation hors connexion."));
    const done = error => { clearTimeout(timer); worker.removeEventListener('controllerchange',changed); error ? reject(error) : resolve(); };
    const changed = () => { if (worker.controller) done(); };
    const timer = setTimeout(()=>done(Error("Le mode hors connexion n’est pas encore prêt. Nouvelle tentative automatique dès que possible.")),20000);
    worker.addEventListener('controllerchange',changed);
    changed();
  });
}
function startAutomaticOfflinePreparation({force=false, refresh=false}={}) {
  const owner = session?.user_id;
  if (!owner) return Promise.resolve();
  if (automaticOfflineRun) {
    return automaticOfflineRun.then(()=>{
      if (session?.user_id !== automaticOfflineOwner) return startAutomaticOfflinePreparation({force:true});
    });
  }
  if (!force && automaticOfflineOwner === owner && Date.now()-automaticOfflineLastCheck < 60000) {
    renderConnectionSettings();
    return Promise.resolve();
  }
  clearTimeout(automaticOfflineRetry);
  if (automaticOfflineOwner !== owner) { settingsSyncDetail={};automaticOfflineFailures=0; }
  automaticOfflineOwner = owner;
  automaticOfflineLastCheck = Date.now();
  const current = () => session?.user_id === owner;
  showOfflinePreparationState('preparing','Préparation automatique du mode hors connexion…',owner);
  automaticOfflineRun = (async()=>{
    const engine = await demarrerModeHorsConnexion();
    if (!current()) return;
    if (!engine) throw Error("Stockage hors connexion indisponible sur cet appareil.");
    await waitForOfflineWorker();
    const {getMeta} = await import('./pwa/storage/database.js');
    const saved = await getMeta('offline-preparation');
    const cache = await offlineWorkerRequest('CHECK_OFFLINE');
    if (!current()) return;
    if (!refresh && saved?.userId === owner && saved.version === cache.version && cache.ready) {
      showOfflinePreparationState('ready','Prêt hors connexion. Les données se synchronisent automatiquement quand Internet est disponible.',owner);
    } else {
      if (!navigator.onLine) throw Error("Copie hors connexion incomplète. La préparation reprendra automatiquement au retour d’Internet.");
      await prepareOfflineDevice(message=>showOfflinePreparationState('preparing',message,owner));
      if (!current()) return;
      showOfflinePreparationState('ready','Prêt hors connexion. Préparation automatique terminée ; les données continuent à se synchroniser.',owner);
    }
    automaticOfflineFailures = 0;
  })().catch(error=>{
    if (!current()) return;
    showOfflinePreparationState('error',error.message,owner);
    if (navigator.onLine) {
      const delay = Math.min(300000,30000 * 2 ** Math.min(automaticOfflineFailures++,4));
      automaticOfflineRetry = setTimeout(()=>startAutomaticOfflinePreparation({force:true}),delay);
    }
  }).finally(()=>{ automaticOfflineRun = null; });
  return automaticOfflineRun;
}
window.addEventListener('online',()=>startAutomaticOfflinePreparation({force:true}));
window.addEventListener('offline',()=>startAutomaticOfflinePreparation({force:true}));
document.addEventListener('visibilitychange',()=>{
  if (document.visibilityState === 'visible') startAutomaticOfflinePreparation();
});
window.addEventListener('eps:pwa-sync-state',event=>{
  settingsSyncDetail=event.detail;
  renderConnectionSettings();
});
