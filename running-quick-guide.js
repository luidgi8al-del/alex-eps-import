/* Optional help only: never changes a test, a group or a save state. */
(function(){
 const key=owner=>`eps_tool_help:${owner}:TROIS_500:v1`;
 const dismissed=new Set();let account=null,mode='intro',step=0,scheduled=false;
 const steps=[
  ['Choisir la classe','Choisissez votre classe dans l’en-tête. Usage libre permet un essai sans rattachement à une classe.','.running-header-class'],
  ['Organiser les élèves','Gardez « Sans groupe » ou créez un groupe. Un appui prolongé sur un groupe permet de modifier ses membres. Les groupes restent facultatifs.','.running-group-tabs'],
  ['Saisir les temps','Réglez la distance, le nombre de courses et la difficulté. Saisissez 315 pour 3 min 15 s dans la colonne de chaque course. Un clic sur le nom affiche le bilan ; un appui prolongé permet de choisir course ou marche rapide.','.running-grid-wrap'],
  ['Enregistrer et vérifier','Cliquez sur Enregistrer. Vert : enregistré et synchronisé. Orange : enregistré sur cet appareil, en attente de synchronisation. Rouge : les dernières modifications ne sont pas encore enregistrées. En usage libre, choisissez une classe avant de commencer un travail à conserver.','.tool-savebar']
 ];
 const owner=()=>typeof session!=='undefined'?session?.user_id||'local':'local';
 const seen=id=>{try{return localStorage.getItem(key(id))==='done'}catch{return false}};
 function acknowledge(){dismissed.add(account);try{localStorage.setItem(key(account),'done')}catch{}mode='hidden';refresh()}
 function refresh(scroll=false){
  document.querySelectorAll('.running-guide-target').forEach(e=>e.classList.remove('running-guide-target'));
  document.querySelectorAll('.running-guide-card').forEach(e=>e.remove());
  attach(scroll);
 }
 function attach(scroll=false){
  const panel=typeof toolPanel!=='undefined'?toolPanel:null;
  const body=panel?.querySelector('.running-grid')?.closest('#epsTestBody');
  if(!body||!panel.isConnected||panel.hidden||panel.style.display==='none'){
   // Loading a new class briefly replaces the table; keep the current tour step.
   if(panel?.isConnected&&!panel.hidden&&panel.style.display!=='none'&&typeof epsOpenTest!=='undefined'&&epsOpenTest==='TROIS_500')return;
   document.querySelectorAll('[data-running-help],.running-guide-card').forEach(e=>e.remove());
   document.querySelectorAll('.running-guide-target').forEach(e=>e.classList.remove('running-guide-target'));account=null;return;
  }
  const id=owner();if(account!==id){account=id;mode=seen(id)||dismissed.has(id)?'hidden':'intro';step=0;panel.querySelector('.running-guide-card')?.remove()}
  const controls=panel.querySelector('.tool-close-controls');
  if(controls&&!controls.querySelector('[data-running-help]')){
   const help=document.createElement('button');help.type='button';help.className='secondary running-help';help.dataset.runningHelp='';help.textContent='? Aide';help.setAttribute('aria-label','Aide du 3 × 500 m');
   help.onclick=()=>{mode='intro';step=0;refresh(true)};controls.prepend(help);
  }
  if(mode==='hidden'||panel.querySelector('.running-guide-card'))return;
  const card=document.createElement('section');card.className='running-guide-card';card.setAttribute('aria-label','Guide du 3 × 500 m');
  if(mode==='intro')card.innerHTML='<strong>Première utilisation ?</strong><p>① Choisissez la classe. ② Avec ou sans groupes. ③ Saisissez les temps. ④ Enregistrez et vérifiez le voyant.</p><div><button type="button" data-guide-start>Me guider</button><button type="button" class="secondary" data-guide-done>J’ai compris</button><button type="button" class="secondary" data-guide-exit>Plus tard</button></div>';
  else card.innerHTML=`<strong tabindex="-1">${step+1} / 4 · ${steps[step][0]}</strong><p>${steps[step][1]}</p><div>${step?'<button type="button" class="secondary" data-guide-back>Précédent</button>':''}<button type="button" data-guide-next>${step===3?'J’ai compris':'Suivant'}</button><button type="button" class="secondary" data-guide-exit>Quitter le guide</button></div>`;
  let target=mode==='guide'?panel.querySelector(steps[step][2]):null;
  if(step===1&&mode==='guide'&&!target)card.querySelector('p').textContent='Les groupes sont disponibles après le choix d’une classe. Vous pouvez aussi rester sans groupe et continuer.';
  if(target&&step>0)target.before(card);else body.before(card);
  if(target)target.classList.add('running-guide-target');
  card.querySelector('[data-guide-start]')?.addEventListener('click',()=>{mode='guide';step=0;refresh(true)});
  card.querySelector('[data-guide-done]')?.addEventListener('click',acknowledge);
  card.querySelector('[data-guide-exit]')?.addEventListener('click',()=>{dismissed.add(account);mode='hidden';refresh();controls?.querySelector('[data-running-help]')?.focus({preventScroll:true})});
  card.querySelector('[data-guide-back]')?.addEventListener('click',()=>{step--;refresh(true)});
  card.querySelector('[data-guide-next]')?.addEventListener('click',()=>{if(step===3)acknowledge();else{step++;refresh(true)}});
  if(scroll){card.scrollIntoView({block:'nearest',behavior:'instant'});const heading=card.querySelector('strong');heading.tabIndex=-1;heading.focus({preventScroll:true})}
 }
 function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;attach()},0)}
 new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
 globalThis.EpsRunningQuickGuide={attach};
})();
