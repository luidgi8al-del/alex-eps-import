// Module isole : le code vit dans une fonction, pas dans la portee globale.
// Deux fichiers peuvent donc declarer le meme nom sans SyntaxError qui tue la page.
// Les noms ci-dessous restent volontairement globaux : l'inline script d'index.html
// et les attributs onclick du HTML les appellent par leur nom nu.
(function () {
  /* Version checks for edits made from an already-open planning form. */
  window.addEventListener("unhandledrejection", event => {
    let box=document.getElementById("syncFailureNotice");
    if(!box){box=document.createElement("div");box.id="syncFailureNotice";box.setAttribute("role","alert");
      box.style.cssText="position:fixed;bottom:20px;left:5%;right:5%;z-index:99999;background:#fff2e4;color:#702c0d;border:2px solid #c56a1e;padding:16px;border-radius:12px;cursor:pointer";
      box.onclick=()=>box.remove();document.body.appendChild(box);}
    box.textContent=(event.reason?.message || "Enregistrement non confirmé. Vérifiez votre connexion.")+" (Cliquez pour fermer.)";
  });
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
