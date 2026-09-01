// Module isole : le code vit dans une fonction, pas dans la portee globale.
// Deux fichiers peuvent donc declarer le meme nom sans SyntaxError qui tue la page.
// Les noms ci-dessous restent volontairement globaux : l'inline script d'index.html
// et les attributs onclick du HTML les appellent par leur nom nu.
(function () {
  function periodSettingsKey() { return `eps_period_settings:${session?.user_id || "anonymous"}`; }
  function cachedPeriodSettings() {
    try { return JSON.parse(localStorage.getItem(periodSettingsKey()) || "null"); } catch { return null; }
  }
  function periodCountForLevel(grade, prefs) {
    const shared=cachedPeriodSettings()?.period_counts;
    const configured=Number(prefs?.periodCounts?.[grade] ?? shared?.[grade]);
    if([3,4,5].includes(configured)) return configured;
    return String(grade || "").startsWith("TERMINALE") ? 3 : 4;
  }
  async function refreshPeriodSettings() {
    if(!session) return;
    const owner=session.user_id;
    const response=await apiFetch(`${SUPABASE_URL}/rest/v1/teacher_period_settings?user_id=eq.${owner}&select=*`);
    if(!response.ok) throw new Error("Réglages non synchronisés : appliquez schema_sync_safety.sql dans Supabase.");
    const rows=await response.json();
    if(session?.user_id!==owner) return;
    if(rows.length) localStorage.setItem(periodSettingsKey(),JSON.stringify(rows[0]));
  }
  async function savePeriodSettings(counts, revision) {
    for(const value of Object.values(counts)) if(![3,4,5].includes(value)) throw new Error("Chaque niveau doit avoir 3, 4 ou 5 périodes.");
    const owner=session.user_id;
    const response=await apiFetch(`${SUPABASE_URL}/rest/v1/rpc/save_teacher_period_settings`,{method:"POST",body:JSON.stringify({p_revision:revision,p_counts:counts})});
    const result=await response.json();
    if(!result.saved) throw new Error("Les périodes ont changé sur un autre appareil. Vos choix restent affichés ; rechargez les réglages pour comparer.");
    if(session?.user_id===owner) localStorage.setItem(periodSettingsKey(),JSON.stringify({period_counts:counts,revision:result.revision}));
  }

  // Surface publique du module.
  globalThis.periodSettingsKey = periodSettingsKey;
  globalThis.cachedPeriodSettings = cachedPeriodSettings;
  globalThis.periodCountForLevel = periodCountForLevel;
  globalThis.refreshPeriodSettings = refreshPeriodSettings;
  globalThis.savePeriodSettings = savePeriodSettings;
})();
