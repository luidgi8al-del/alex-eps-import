/* Explicit preparation; readiness requires both public resources and account data. */
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
  const assets = await offlineWorkerRequest('PREPARE_OFFLINE', d => progress(`Téléchargement des outils : ${d.progress} / ${d.total}`));
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
