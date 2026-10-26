/* Read the exact teacher-written content, rather than regenerating a generic substitute. */
(function(){
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function savedLessons(cycle,{isCurrent=()=>true}={}){
    const lessonOwner=typeof session!=='undefined'?session?.user_id:null;
    const current=()=>lessonOwner&&session?.user_id===lessonOwner&&isCurrent();
    if(!current())return [];
    const engine=await demarrerModeHorsConnexion();
    if(!current())return [];
    if(engine?.adapter.tables.includes('eps_lesson_archives')) {
      const result=await engine.lire('eps_lesson_archives',{ou:r=>r.cycle_id===cycle.id&&!r.deleted});
      if(!current())return [];
      return result.rows?.[0]?.payload?.lessons || [];
    }
    if(!navigator.onLine)return [];
    const r=await apiFetch(`${SUPABASE_URL}/rest/v1/eps_lesson_archives?cycle_id=eq.${encodeURIComponent(cycle.id)}&select=payload`);
    if(!current())return [];
    if(r.status===404)return [];
    if(!r.ok)throw Error('Le contenu rédigé des séances n’a pas pu être vérifié.');
    const rows=await r.json();
    return current() ? rows[0]?.payload?.lessons || [] : [];
  }
  function showSavedLesson(lesson,label){
    const host=document.getElementById('sessionSheet');
    const block=(title,value)=>value?`<section class="card"><h3>${escape(title)}</h3><div style="white-space:pre-wrap">${escape(value)}</div></section>`:'';
    host.innerHTML=`<div class="top"><h2>${escape(label)} · ${escape(lesson.title)}</h2><button id="closeSavedLesson" class="secondary">Fermer</button></div><p class="muted">Contenu rédigé et synchronisé depuis l’APK. Les notes personnelles sont privées au compte professeur.</p>`+
      block('Objectif',lesson.mainObjective)+block('Compétences',lesson.competencesTravaillees)+block('Matériel',lesson.materiel)+
      block('Échauffement',lesson.warmupDescription)+(lesson.situations||[]).map(s=>`<section class="card"><h3>${escape(s.title)}</h3>${block('But',s.goal)}${block('Mise en place',s.setup)}${block('Organisation',s.organization)}${block('Consignes',s.instructions)}${block('Réussite',s.successCriteria)}${block('Simplifier',s.simplifyVariables)}${block('Complexifier',s.complexifyVariables)}</section>`).join('')+
      block('Sécurité',lesson.safetyNotes)+block('Rôles sociaux',lesson.socialRoles)+block('Bilan',lesson.closingSummary)+block('Évaluation',lesson.evaluationNote)+block('Notes personnelles',lesson.personalNote);
    host.style.display='block';document.getElementById('closeSavedLesson').onclick=()=>host.style.display='none';host.scrollIntoView({block:'start'});
  }
  globalThis.savedLessons=savedLessons;globalThis.showSavedLesson=showSavedLesson;
})();
