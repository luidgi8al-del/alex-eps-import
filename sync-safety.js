// Module isole : le code vit dans une fonction, pas dans la portee globale.
// Deux fichiers peuvent donc declarer le meme nom sans SyntaxError qui tue la page.
// Les noms ci-dessous restent volontairement globaux : l'inline script d'index.html
// et les attributs onclick du HTML les appellent par leur nom nu.
(function () {
  const notified = new WeakSet();
  function showFailure({ localSave = false, error } = {}) {
    let box=document.getElementById("syncFailureNotice");
    // A secondary unrelated failure must not hide a warning about unsaved work.
    if(box?.dataset.localSave === 'true' && !localSave)return;
    if(!box){box=document.createElement("div");box.id="syncFailureNotice";box.setAttribute("role","alert");
      box.style.cssText="position:fixed;bottom:calc(12px + env(safe-area-inset-bottom,0px));left:5%;right:5%;z-index:99999;background:#fff2e4;color:#702c0d;border:2px solid #c56a1e;padding:16px;border-radius:12px;max-height:45vh;overflow:auto";
      document.body.appendChild(box);}
    box.dataset.localSave=String(localSave);box.replaceChildren();
    const title=document.createElement('strong'),text=document.createElement('p'),dismiss=document.createElement('button');
    title.textContent=localSave?'Enregistrement sur cet appareil non confirmé':'Une action n’a pas pu aboutir';
    text.textContent=localSave
      ? (error?.name==='QuotaExceededError'?'Le stockage de cet appareil est plein. Libérez de l’espace sans effacer les données EPS, puis réessayez Enregistrer. Gardez cet écran ouvert.':'Gardez cet écran ouvert et réessayez Enregistrer. Ne supprimez pas les données EPS et ne ressaisissez pas votre travail dans une nouvelle fiche.')
      : 'Le résultat de cette action n’est pas confirmé. Gardez vos saisies ouvertes et vérifiez le résultat avant de réessayer, pour éviter un doublon. Pour un problème d’envoi, vérifiez Réglage → Compte web / synchronisation.';
    dismiss.type='button';dismiss.textContent='Masquer ce message';dismiss.onclick=()=>box.remove();
    box.append(title,text,dismiss);
  }
  // This signal is sent only after a local write actually failed, not for a network outage.
  window.addEventListener('eps:local-save-failed', event=>{
    const error=event.detail?.error;
    if(error && (typeof error==='object'||typeof error==='function'))notified.add(error);
    showFailure({localSave:true,error});
  });
  window.addEventListener("unhandledrejection", event => {
    if(event.reason && (typeof event.reason==='object'||typeof event.reason==='function') && notified.has(event.reason))return;
    // The raw exception may contain SQL, identifiers or transport details. Do not
    // confuse an unrelated action failure with a confirmed failed/queued save.
    showFailure({error:event.reason});
  });
  /* Version checks for edits made from an already-open planning form. */
  async function patchPlanningActivity(row, changes) {
    if (!row.updated_at) throw new Error("Rechargez le planning avant de modifier cette activité.");
    const response = await apiFetch(`${SUPABASE_URL}/rest/v1/period_activities?id=eq.${encodeURIComponent(row.id)}&updated_at=eq.${encodeURIComponent(row.updated_at)}`, {
      method:"PATCH", headers:{Prefer:"return=representation"},
      body:JSON.stringify({...changes, updated_at:new Date().toISOString()})
    });
    const rows = await response.json();
    if (rows.length !== 1) throw new Error("Cette activité a changé sur un autre appareil. Vos choix restent affichés : notez-les puis rechargez le planning pour comparer.");
    Object.assign(row, rows[0]);
    return rows[0];
  }

  // Surface publique du module.
  globalThis.patchPlanningActivity = patchPlanningActivity;
})();
