/* 3 × 500 m sur le terrain : saisie Manuelle (tableau ou grille de cases) ou Chrono auto.
   En Chrono auto, on lance le chrono au depart du groupe ; toucher la case d'un eleve a l'arrivee
   inscrit son temps dans la course en cours. Une fois le groupe arrive, on enregistre et on passe
   au groupe suivant, puis a la course suivante. La note est celle du 3 × 500 habituel.
   S'appuie sur l'etat de outils.js (runningValues, runningGroups, runningCount...). */
let runningChrono=(()=>{try{return localStorage.getItem('eps_run_chrono')==='auto'?'auto':'manuel'}catch{return 'manuel'}})();
let runningVue=(()=>{try{return localStorage.getItem('eps_run_vue')==='grille'?'grille':'tableau'}catch{return 'tableau'}})();
let runningCourse=0,runningCourseCle=null,runningDepart=null,runningArretAuto=null,runningTicker=null,runningArrivees=[],runningPlein=false;
// Une fois le test commence, les reglages et les groupes se replient ; une fleche a droite les rouvre.
let runReglagesOuverts=false,runGroupesOuverts=false;

const runEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function runGrilleVisible(){return runningChrono==='auto'||runningVue==='grille'}
function runA(s,i){const v=runningValues[s.id]?.[i];return v===RUNNING_REMOVED||String(v??'').trim()!==''}
function runEleves(groupe){return groupe>=0?(runningGroups[groupe]||[]).map(id=>toolStudents.find(s=>String(s.id)===String(id))).filter(Boolean):toolStudents}
/** Premiere course ou il manque un temps dans ce groupe ; la derniere si tout est rempli. */
function runCoursParDefaut(eleves){for(let i=0;i<runningCount;i++)if(eleves.some(s=>!runA(s,i)))return i;return Math.max(0,runningCount-1)}
/** Prochaine etape : meme course pour les groupes suivants, puis course suivante. */
function runEtapeSuivante(){
  const groupes=runningGroups.length?runningGroups.map((_,i)=>i):[-1];
  for(let c=0;c<runningCount;c++)for(const g of groupes){const eleves=runEleves(g);if(eleves.length&&eleves.some(s=>!runA(s,c)))return {groupe:g,course:c}}
  return null;
}
function runTempsTexte(raw){const sec=compactRunningSeconds(raw);return sec==null?'—':`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`}
function runChronoTexte(){if(runningDepart==null)return '0:00.0';const d=Math.max(0,Date.now()-runningDepart)/1000;return `${Math.floor(d/60)}:${String(Math.floor(d%60)).padStart(2,'0')}.${Math.floor(d*10)%10}`}
function runTic(){const el=document.getElementById('runChronoTime');if(el)el.textContent=runChronoTexte()}
function runDemarrerTicker(){clearInterval(runningTicker);runningTicker=setInterval(runTic,100);runTic()}
function runArreter(auto){if(auto)runningArretAuto=runningDepart;else runningArretAuto=null;runningDepart=null;clearInterval(runningTicker);runningTicker=null}

function runChoix(nom,valeur,options){return `<span class="run-choix" role="group" aria-label="${nom}">${options.map(([v,l])=>`<button type="button" class="${valeur===v?'':'secondary'}" data-run-choix="${nom}" data-run-valeur="${v}" aria-pressed="${valeur===v}">${l}</button>`).join('')}</span>`}

function runTuile(s){
  const id=runEsc(s.id),total=runningSummary(s)?.total,sexe=typeof stopClasseSexe==='function'?stopClasseSexe(s):'',teinte=typeof stopTeinteSexe==='function'?stopTeinteSexe(s):'#8da8ba';
  const nom=runEsc(typeof stopNomCourt==='function'?stopNomCourt(s):studentLabel(s)),walk=runningWalking.has(String(s.id))?' <span class="running-walk-badge">M.R</span>':'';
  const note=`<small class="run-tile-note" data-run-score="${id}">Note : ${total!=null?EpsTests.fr(total,2):'—'}</small>`;
  if(runningChrono==='auto'){
    const v=runningValues[s.id]||[],cur=v[runningCourse],arrive=runA(s,runningCourse);
    const courses=v.map((t,i)=>`<i class="${i===runningCourse?'cur':''}">${i+1} : ${t===RUNNING_REMOVED?'retirée':runTempsTexte(t)}</i>`).join('');
    return `<article class="run-tile${sexe}${arrive?' arrive':''}" data-run-tile="${id}" style="--teinte:${teinte}"><button type="button" class="run-tile-plus" data-run-arrivee="${id}" aria-label="Arrivée de ${runEsc(studentLabel(s))}"><span class="run-tile-nom">${nom}${walk}</span><b class="run-tile-temps">${cur===RUNNING_REMOVED?'Retirée':arrive?'✓ '+runTempsTexte(cur):'—'}</b><span class="run-tile-courses">${courses}</span>${note}</button></article>`;
  }
  const saisies=(runningValues[s.id]||[]).map((v,i)=>v===RUNNING_REMOVED?`<button class="running-removed" data-run-student="${id}" data-run-index="${i}">Retirée</button>`:`<label><span>${i+1}</span><input inputmode="numeric" maxlength="3" placeholder="315" title="Temps au format 315 pour 3 min 15 s" aria-label="Course ${i+1} de ${runEsc(studentLabel(s))}" aria-invalid="${runningHasInvalidTimes([v])}" data-run-student="${id}" data-run-index="${i}" value="${runEsc(v)}"></label>`).join('');
  return `<article class="run-tile run-tile-manuel${sexe}" data-run-tile="${id}" style="--teinte:${teinte}"><button type="button" class="run-tile-nom run-tile-nom-btn" data-run-name="${id}">${nom}${walk}</button><div class="run-tile-saisies">${saisies}</div>${note}</article>`;
}

function runFleche(cle,ouvert,libelle){return `<button type="button" class="secondary run-fleche" data-run-deplier="${cle}" aria-expanded="${ouvert}" aria-label="${ouvert?'Masquer':'Afficher'} ${libelle}" title="${ouvert?'Masquer':'Afficher'} ${libelle}">${ouvert?'▴':'▾'}</button>`}
/** Protocole, format, nombre de courses et difficulte : replies (resume + fleche) apres « Commencer le test ». */
function runReglagesHtml(corps){
  if(!epsTestStarted)return corps;
  const d=runningDifficulty>0?'+'+runningDifficulty:runningDifficulty;
  return `<section class="run-prep"><div class="run-prep-ligne"><span class="run-prep-resume">${runningCount} × ${runningDistance} m · Difficulté ${d} %</span>${runFleche('reglages',runReglagesOuverts,'les réglages')}</div><div class="run-prep-corps"${runReglagesOuverts?'':' hidden'}>${corps}</div></section>`;
}
/** Groupes : replies apres « Commencer le test ». Sans groupe, une simple ligne ; avec des groupes,
    seulement Groupe 1, 2, 3... (toucher pour choisir, appui prolonge pour modifier). */
function runGroupesHtml(corps){
  if(!epsTestStarted)return corps;
  // Ouvert, la ligne ne repete pas les boutons de groupe deja presents dans le bloc complet.
  const ligne=runGroupesOuverts?'<span class="run-prep-resume">Groupes</span>':runningGroups.length
    ?`<div class="running-group-tabs run-groupes-replies">${runningGroups.map((g,i)=>`<button class="${runningActiveGroup===i?'':'secondary'}" data-running-group="${i}" title="Appui prolongé : modifier">Groupe ${i+1} · ${g.length}</button>`).join('')}</div>`
    :'<span class="run-prep-resume">Sans groupe · ordre alphabétique</span>';
  return `<section class="run-prep"><div class="run-prep-ligne">${ligne}${runFleche('groupes',runGroupesOuverts,'les groupes')}</div><div class="run-prep-corps"${runGroupesOuverts?'':' hidden'}>${corps}</div></section>`;
}
/** Manuel / Chrono auto, Tableau / Grille, Agrandir, et « Commencer le test » avant le debut.
    En plein ecran, la barre est dans la section plein ecran (runTerrainHtml). */
function runBarreHtml(){
  if(runningPlein&&runGrilleVisible())return '';
  return runBarreContenu(true);
}
function runBarreContenu(avecDebut){
  const debut=avecDebut&&!epsTestStarted&&onRealClass()?'<button type="button" id="runBegin">Commencer le test</button>':'';
  return `<div class="run-terrain-barre">${runChoix('Chronométrage',runningChrono,[['manuel','Manuel'],['auto','⏱ Chrono auto']])}${runningChrono==='manuel'?runChoix('Affichage',runningVue,[['tableau','Tableau'],['grille','Grille']]):''}${runGrilleVisible()?`<button type="button" class="secondary" id="runAgrandir">${runningPlein?'⤡ Réduire':'⤢ Agrandir'}</button>`:''}${debut}</div>`;
}

/** Chrono, puis tableau d'origine ou grille de cases (la barre est au-dessus des groupes). */
function runTerrainHtml(eleves,tableau){
  const cle=`${toolClassId}|${runningActiveGroup}|${runningSessionId||''}`;
  if(runningCourseCle!==cle){runningCourse=runCoursParDefaut(eleves);runningCourseCle=cle}
  runningCourse=Math.min(runningCourse,Math.max(0,runningCount-1));
  const barre=runningPlein?runBarreContenu(false):'';
  if(!runGrilleVisible())return tableau;
  const groupes=runningPlein&&runningGroups.length?`<div class="run-plein-groupes"><button class="${runningActiveGroup<0?'':'secondary'}" data-running-group="-1">Tous</button>${runningGroups.map((g,i)=>`<button class="${runningActiveGroup===i?'':'secondary'}" data-running-group="${i}">Groupe ${i+1}</button>`).join('')}</div>`:'';
  let chrono='';
  if(runningChrono==='auto'){
    const tous=eleves.length&&eleves.every(s=>runA(s,runningCourse)),suite=runEtapeSuivante();
    const libelle=e=>e.groupe>=0?`Groupe ${e.groupe+1} · course ${e.course+1}`:`course ${e.course+1}`;
    const memeEtape=suite&&suite.groupe===runningActiveGroup&&suite.course===runningCourse;
    const etat=runningDepart!=null?'Touchez la case de chaque élève à son arrivée.':tous?(suite?'':'Toutes les courses sont faites : enregistrez pour garder les notes.'):'Lancez le chrono au départ du groupe.';
    const suivant=onRealClass()&&tous&&runningDepart==null?(suite&&!memeEtape?`<button type="button" id="runEtapeSuivante" data-groupe="${suite.groupe}" data-course="${suite.course}">💾 Enregistrer et passer : ${libelle(suite)}</button>`:!suite?'<button type="button" id="runEtapeFin">💾 Enregistrer les résultats</button>':''):'';
    chrono=`<div class="run-chrono">${runChoix('Course',String(runningCourse),Array.from({length:runningCount},(_,i)=>[String(i),`Course ${i+1}`]))}<output id="runChronoTime" class="run-chrono-temps${runningDepart!=null?' en-cours':''}" aria-live="off">${runChronoTexte()}</output>${runningDepart!=null?'<button type="button" class="danger" id="runChronoStop">■ Arrêter</button>':'<button type="button" id="runChronoGo">▶ Lancer le chrono</button>'}<button type="button" class="secondary" id="runAnnulerArrivee">↶ Annuler la dernière arrivée</button>${suivant}<p id="runChronoMsg" role="status">${etat}</p></div>`;
  }
  return `<section class="run-terrain${runningPlein?' run-plein':''}">${barre}${groupes}${chrono}<div class="run-grille">${eleves.map(runTuile).join('')||'<p class="muted">Aucun élève dans ce groupe.</p>'}</div></section>`;
}

/** En plein ecran, les plus grandes cases possibles sans defilement (comme Arret course). */
function runAjusterGrille(){
  const grille=document.querySelector('.run-terrain .run-grille');if(!grille)return;
  if(!runningPlein){grille.style.gridTemplateColumns='';grille.style.gridAutoRows='';grille.style.removeProperty('--tuile-h');return}
  const n=grille.querySelectorAll('.run-tile').length;if(!n)return;
  const gap=8,W=grille.clientWidth,H=Math.max(140,innerHeight-grille.getBoundingClientRect().top-12);
  let colonnes=1,taille=0;
  for(let c=1;c<=n;c++){const w=(W-gap*(c-1))/c;if(c>1&&w<110)break;const rangs=Math.ceil(n/c),h=(H-gap*(rangs-1))/rangs,t=Math.min(w,h*1.3);if(t>taille){taille=t;colonnes=c}}
  const rangs=Math.ceil(n/colonnes),h=Math.max(96,Math.floor((H-gap*(rangs-1))/rangs));
  grille.style.gridTemplateColumns=`repeat(${colonnes},minmax(0,1fr))`;grille.style.gridAutoRows=`${h}px`;grille.style.setProperty('--tuile-h',h+'px');
}
addEventListener('keydown',e=>{if(e.key==='Escape'&&runningPlein&&document.querySelector('.run-terrain.run-plein')){runningPlein=false;document.querySelector('.run-terrain')?.classList.remove('run-plein');const b=document.getElementById('runAgrandir');if(b)b.textContent='⤢ Agrandir';runAjusterGrille()}});
addEventListener('resize',()=>{if(runningPlein)runAjusterGrille()});

function runTerrainBind(host,test,eleves){
  const repeindre=()=>paintRunningSeriesTest(test);
  const message=t=>{const el=document.getElementById('runChronoMsg');if(el)el.textContent=t};
  host.querySelectorAll('[data-run-choix]').forEach(b=>b.onclick=()=>{
    const nom=b.dataset.runChoix,v=b.dataset.runValeur;
    if(nom==='Chronométrage'){if(v===runningChrono)return;if(runningDepart!=null&&!confirm('Le chrono tourne. Revenir en saisie manuelle l’arrête. Continuer ?'))return;if(v==='manuel')runArreter(false);runningChrono=v;try{localStorage.setItem('eps_run_chrono',v)}catch{}}
    else if(nom==='Affichage'){runningVue=v;try{localStorage.setItem('eps_run_vue',v)}catch{}}
    else if(nom==='Course'){runningCourse=+v}
    if(!runGrilleVisible())runningPlein=false;
    repeindre();
  });
  document.getElementById('runAgrandir')?.addEventListener('click',()=>{runningPlein=!runningPlein;repeindre()});
  document.getElementById('runBegin')?.addEventListener('click',()=>{epsTestStarted=true;runReglagesOuverts=false;runGroupesOuverts=false;repeindre()});
  host.querySelectorAll('[data-run-deplier]').forEach(b=>b.onclick=()=>{if(b.dataset.runDeplier==='reglages')runReglagesOuverts=!runReglagesOuverts;else runGroupesOuverts=!runGroupesOuverts;repeindre()});
  document.getElementById('runChronoGo')?.addEventListener('click',()=>{runningDepart=Date.now();runningArretAuto=null;runningArrivees=[];repeindre();runDemarrerTicker()});
  document.getElementById('runChronoStop')?.addEventListener('click',()=>{if(!confirm('Arrêter le chrono ? Les temps déjà relevés sont conservés.'))return;runArreter(false);repeindre()});
  document.getElementById('runAnnulerArrivee')?.addEventListener('click',()=>{
    const derniere=runningArrivees.pop();if(!derniere){message('Aucune arrivée à annuler.');return}
    const [id,i,avant]=derniere;if(runningValues[id])runningValues[id][i]=avant;
    // Le chrono s'etait arrete tout seul a la derniere arrivee : on le relance d'ou il en etait.
    if(runningDepart==null&&runningArretAuto!=null){runningDepart=runningArretAuto;runningArretAuto=null;runDemarrerTicker()}
    repeindre();
  });
  const passer=async(groupe,course)=>{
    const bouton=document.getElementById(groupe==null?'runEtapeFin':'runEtapeSuivante');if(bouton)bouton.disabled=true;
    try{await saveRunningSeries(test,false)}catch(e){const msg=document.getElementById('runningMsg');if(msg)msg.textContent='Enregistrement non confirmé : '+e.message;if(bouton)bouton.disabled=false;return}
    if(groupe!=null){runningActiveGroup=groupe;runningCourse=course;runningCourseCle=`${toolClassId}|${groupe}|${runningSessionId||''}`;repeindre();message('Passage enregistré. Lancez le chrono au départ du groupe.')}
  };
  document.getElementById('runEtapeSuivante')?.addEventListener('click',e=>passer(+e.currentTarget.dataset.groupe,+e.currentTarget.dataset.course));
  document.getElementById('runEtapeFin')?.addEventListener('click',()=>passer(null));
  const grille=host.querySelector('.run-grille');
  if(grille&&runningChrono==='auto')grille.addEventListener('click',e=>{
    const b=e.target.closest('[data-run-arrivee]');if(!b)return;
    const s=toolStudents.find(x=>String(x.id)===String(b.dataset.runArrivee));if(!s)return;
    const v=runningValues[s.id],i=runningCourse;
    if(runningDepart==null){message('Lancez d’abord le chrono.');return}
    if(v[i]===RUNNING_REMOVED){message(`La course ${i+1} est retirée pour ${studentLabel(s)}.`);return}
    if(runA(s,i)){message(`${studentLabel(s)} a déjà un temps pour la course ${i+1}. « Annuler la dernière arrivée » pour corriger.`);return}
    const sec=Math.round((Date.now()-runningDepart)/1000);
    if(sec<1)return;
    if(sec>599){message('Au-delà de 9 min 59, saisissez le temps en mode Manuel.');return}
    runningArrivees.push([s.id,i,v[i]]);v[i]=String(Math.floor(sec/60)*100+sec%60);
    if(eleves.every(x=>runA(x,i)))runArreter(true);
    // Mise a jour sur place : pas de redessin complet, pour ne pas perdre la position en plein ecran.
    const tuile=grille.querySelector(`[data-run-tile="${CSS.escape(String(s.id))}"]`);if(tuile)tuile.outerHTML=runTuile(s);
    if(runningDepart==null)repeindre();else message(`${studentLabel(s)} : ${runTempsTexte(v[i])} (course ${i+1}).`);
    EpsToolResume?.capture?.();
  });
  runAjusterGrille();
}
