/* Groupes de départ du 3 x 500 partagés avec l'application.
   Ils vivent dans une composition de classe (saved_teams / saved_team_members, déjà synchronisées)
   dont l'identifiant est le même des deux côtés : t500-<classe>-p<période>, et chaque membre
   t500-<classe>-p<période>-<élève>. L'application écrit exactement les mêmes identifiants
   (Trois500GroupSync.kt) : la même ligne est mise à jour, jamais dupliquée. */
let runGroupesRef={cle:null,sig:'[]'},runGroupesSuspendu=false,runGroupesFile=Promise.resolve();
function runGroupesCle(){return `${toolClassId}|${epsTestPeriod}`}
function runGroupesIdent(classId,period){return `t500-${classId}-p${period}`}
function runGroupesSig(groupes){return JSON.stringify(groupes.map(g=>[...new Set(g.map(String))]).filter(g=>g.length))}

/** null : aucune composition partagée ; [] : supprimée ; sinon les groupes dans l'ordre. */
async function runGroupesCharger(classId,period){
  const id=runGroupesIdent(classId,period);
  const team=(await lireTable('saved_teams',`saved_teams?id=eq.${encodeURIComponent(id)}&select=*`,{ou:r=>String(r.id)===id}))[0];
  if(!team)return null;
  if(team.deleted)return [];
  const membres=await lireTable('saved_team_members',`saved_team_members?saved_team_id=eq.${encodeURIComponent(id)}&deleted=eq.false&select=*`,{ou:r=>String(r.saved_team_id)===id&&!r.deleted});
  const parIndex=new Map();
  membres.forEach(m=>{const i=Number(m.team_index);if(!parIndex.has(i))parIndex.set(i,[]);parIndex.get(i).push(String(m.student_id))});
  return [...parIndex.entries()].sort((a,b)=>a[0]-b[0]).map(e=>[...new Set(e[1])]).filter(g=>g.length);
}

/** À l'ouverture du 3 x 500 (ou au changement de classe / période) : reprend les groupes partagés. */
async function runGroupesOuvrir(){
  if(!onRealClass())return;
  const cle=runGroupesCle();
  if(runGroupesRef.cle===cle)return;
  let partages=null;
  try{partages=await runGroupesCharger(toolClassId,epsTestPeriod)}catch(e){console.warn('Groupes 3 x 500 partagés illisibles',e);runGroupesRef={cle:null,sig:'[]'};return}
  const presents=new Set(toolStudents.map(s=>String(s.id)));
  if(partages!=null&&!runningSessionId){
    runningGroups=partages;
    runningActiveGroup=runningGroups.length?Math.max(-1,Math.min(runningActiveGroup,runningGroups.length-1)):-1;
    runGroupesRef={cle,sig:runGroupesSig(runningGroups)};
    return;
  }
  // Pas encore de composition partagée : des groupes déjà là (brouillon) et tous de cette classe
  // partent vers l'application ; sinon on ne pousse rien tant qu'ils ne sont pas modifiés.
  const propres=runningGroups.length&&runningGroups.every(g=>g.every(s=>presents.has(String(s))));
  runGroupesRef={cle,sig:propres&&partages==null?'[]':runGroupesSig(runningGroups)};
}

/** Appelé à chaque affichage : enregistre seulement si les groupes ont réellement changé. */
function runGroupesPartager(){
  if(runGroupesSuspendu||!onRealClass()||runGroupesRef.cle!==runGroupesCle())return;
  const sig=runGroupesSig(runningGroups);
  if(sig===runGroupesRef.sig)return;
  runGroupesRef.sig=sig;
  const groupes=JSON.parse(sig),classId=toolClassId,period=epsTestPeriod;
  runGroupesFile=runGroupesFile.then(()=>runGroupesEcrire(classId,period,groupes)).catch(e=>console.warn('Groupes 3 x 500 non partagés',e));
}

async function runGroupesEcrire(classId,period,groupes){
  const id=runGroupesIdent(classId,period),now=new Date().toISOString(),vide=!groupes.length;
  const team=(await lireTable('saved_teams',`saved_teams?id=eq.${encodeURIComponent(id)}&select=*`,{ou:r=>String(r.id)===id}))[0];
  if(!team&&vide)return;
  if(!team||!!team.deleted!==vide)
    await enregistrerLigne('saved_teams',{id,user_id:session.user_id,class_id:classId,name:`3 × 500 m · P${period} · groupes de départ`,mode:'ALEATOIRE',created_at:team?.created_at||now,updated_at:now,deleted:vide},team);
  const membres=await lireTable('saved_team_members',`saved_team_members?saved_team_id=eq.${encodeURIComponent(id)}&select=*`,{ou:r=>String(r.saved_team_id)===id});
  const actuels=new Map(membres.map(m=>[String(m.student_id),m])),voulus=new Map();
  groupes.forEach((g,i)=>g.forEach(s=>voulus.set(String(s),i)));
  for(const [eleve,index] of voulus){
    const m=actuels.get(eleve);
    if(!m||m.deleted||Number(m.team_index)!==index)
      await enregistrerLigne('saved_team_members',{id:m?.id||`${id}-${eleve}`,user_id:session.user_id,saved_team_id:id,student_id:eleve,team_index:index,updated_at:now,deleted:false},m);
  }
  for(const [eleve,m] of actuels)
    if(!m.deleted&&!voulus.has(eleve))await enregistrerLigne('saved_team_members',{...m,updated_at:now,deleted:true},m);
}

/* Ouvrir une session enregistrée reprend ses groupes, sans écraser les groupes de départ. */
if(typeof openRunningSession==='function'){
  const ouvrirSession=openRunningSession;
  openRunningSession=async function(...args){runGroupesSuspendu=true;try{return await ouvrirSession.apply(this,args)}finally{runGroupesSuspendu=false;if(runGroupesRef.cle===runGroupesCle())runGroupesRef.sig=runGroupesSig(runningGroups)}};
}
