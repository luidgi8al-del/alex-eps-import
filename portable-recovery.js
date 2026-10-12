/* Explicit same-account device migration. No authentication or role cache is portable. */
(function(){
  async function context() {
    const owner=session?.user_id;
    if(!owner || localStorage.getItem(`eps:installation-manager-role:${owner}`)!=='false') throw Error('Compte professeur non vérifié : reconnectez-vous avant de sauvegarder ou restaurer.');
    const local=await demarrerModeHorsConnexion();
    if(!local)throw Error('Le stockage local n’est pas disponible.');
    if(session?.user_id!==owner)throw Error('Le compte a changé.');
    return {owner,local};
  }
  function download(json,name){const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function exportDeviceBackup(){
    try {
      const {owner,local}=await context();
      const module=await import('./pwa/storage/portable-backup.js');
      const json=await local.engine.withExclusiveRecovery(()=>module.exportLocalBackup(owner,local.adapter.tables));
      if(session?.user_id!==owner)throw Error('Le compte a changé.');
      download(json,`EPS-LVH-site-PWA-${new Date().toISOString().slice(0,10)}.json`);
      alert('Copie locale exportée, y compris les saisies en attente et les conflits. Les données jamais téléchargées sur cet appareil ne sont pas incluses. Ce fichier contient des données personnelles : conservez-le dans un endroit protégé.');
    }catch(e){alert(`Sauvegarde non confirmée : ${e.message}`);}
  }
  async function restoreDeviceBackup(file){
    try {
      if(!file || file.size>100*1024*1024)throw Error('Fichier absent ou trop volumineux.');
      const {owner,local}=await context();
      const module=await import('./pwa/storage/portable-backup.js');
      const json=await file.text();
      await module.validateLocalBackup(json,owner,local.adapter.tables);
      if(!confirm('Fermez les autres fenêtres et onglets EPS avant de continuer. Fichier contrôlé : remplacer la copie locale de ce compte ? Le serveur et votre connexion ne seront pas remplacés. Les saisies de la sauvegarde reprendront leur synchronisation.'))return;
      const previous=await local.engine.withExclusiveRecovery(()=>module.exportLocalBackup(owner,local.adapter.tables));
      download(previous,`EPS-LVH-avant-restauration-${Date.now()}.json`);
      const result=await local.engine.withExclusiveRecovery(async()=>{
        if(session?.user_id!==owner)throw Error('Le compte a changé.');
        return module.restoreLocalBackup(json,owner,local.adapter.tables);
      });
      alert(`Copie restaurée : ${result.records} fiches, ${result.pending} saisies en attente. Rechargez l’application puis vérifiez la synchronisation. Préparez ce nouvel appareil avant de partir sans réseau.`);
      location.reload();
    }catch(e){alert(`Restauration non confirmée : ${e.message}. Le serveur n’a pas été remplacé.`);}
  }
  globalThis.exportDeviceBackup=exportDeviceBackup;
  globalThis.restoreDeviceBackup=restoreDeviceBackup;
})();
