/* Essai facultatif, limité au 3×500. Le moteur de calcul et le stockage restent existants. */
(function () {
  const basePaint=paintRunningSeriesTest,baseReset=resetRunningSession,baseOpen=openRunningSession;
  let phase="preparation",context="",busy=false,message="",focusPending=false,loading=false;
  const positions=new Map();
  function enabled(){return loadPrefs().runningTerrain===true;}
  function key(){return `${session?.user_id||'anonymous'}:${toolClassId}:P${epsTestPeriod}:${runningSessionId||'new'}`;}
  function hasValues(){return Object.values(runningValues).some(values=>values.some(v=>v&&v!==RUNNING_REMOVED));}
  function position(){try{return positions.get(key())||JSON.parse(localStorage.getItem(`eps_running_position:${key()}`)||'null')}catch{return null}}
  function remember(input){const old=position()||{};const next={...old,group:runningActiveGroup};if(input){next.student=input.dataset.runStudent;next.column=Number(input.dataset.runIndex);}
    positions.set(key(),next);try{localStorage.setItem(`eps_running_position:${key()}`,JSON.stringify(next))}catch{}
  }
  function restoreFocus(host){const saved=position();if(!saved)return;const input=[...host.querySelectorAll('input[data-run-student]')].find(i=>i.dataset.runStudent===saved.student&&Number(i.dataset.runIndex)===saved.column);if(input){input.focus({preventScroll:true});input.select();input.scrollIntoView({block:'nearest',inline:'nearest'});}}
  function repaint(test){paintRunningSeriesTest(test);}
  function setPhase(value,test){phase=value;message="";focusPending=value==='saisie';repaint(test);}
  function stats(){let started=0,complete=0;for(const student of toolStudents){const raw=runningValues[student.id]||[];const active=raw.filter(v=>v!==RUNNING_REMOVED);const valid=active.filter(v=>compactRunningSeconds(v)!=null);if(valid.length)started++;if(active.length&&valid.length===active.length)complete++;}return{started,complete,total:toolStudents.length};}
  async function save(test,finish){
    if(busy)return;
    if(Object.values(runningValues).some(values=>values.some(v=>v&&v!==RUNNING_REMOVED&&compactRunningSeconds(v)==null))){message='Un temps est invalide : les secondes doivent être entre 00 et 59. Corrige-le avant d’enregistrer.';repaint(test);return;}
    const before=position();const group=runningActiveGroup;
    // Garder le même identifiant lors d'une reprise après erreur d'écriture.
    if(!runningSessionId){runningSessionId=crypto.randomUUID();runningCreatedAt=Date.now();context=key();if(before)positions.set(key(),before);}
    for(const student of toolStudents){const raw=runningValues[student.id]||[];const selected=runningSummary(student)||raw.includes(RUNNING_REMOVED)||runningGroups.some(g=>g.includes(String(student.id)))||runningWalking.has(String(student.id));
      if(selected&&!runningResultRecords[student.id])runningResultRecords[student.id]={id:crypto.randomUUID(),user_id:session.user_id,session_id:runningSessionId,student_id:student.id};
    }
    busy=true;message="Enregistrement…";repaint(test);
    try{
      await saveRunningSeries(test,false);
      runningActiveGroup=group>=0&&group<runningGroups.length?group:-1;
      if(before){positions.set(key(),{...before,group:runningActiveGroup});remember();}
      phase='bilan';message=finish?'Séance enregistrée.':'Séance enregistrée, prête à reprendre.';
    }catch(error){phase='saisie';message=`Enregistrement non confirmé : ${error.message}. Les temps affichés sont conservés. Réessaie avant de quitter.`;}
    finally{busy=false;repaint(test);}
  }
  async function seeClass(){
    const period=epsTestPeriod;
    const back=document.getElementById('ecOutilRetour');if(back){await back.onclick();dashboardPeriod=period;ecFiltreEvaluations='Tests';ecAller('evaluations');return;}
    const cls=toolClasses.find(c=>String(c.id)===String(toolClassId));if(!cls)return;
    await loadImports();showTab('classes');await openClassDashboard(cls,cls.name||'Classe');dashboardPeriod=period;ecFiltreEvaluations='Tests';ecAller('evaluations');
  }
  function apply(test,host){
    const switchbar=document.createElement('div');switchbar.className='running-terrain-switch';
    const choice=document.createElement('button');choice.type='button';choice.className='secondary';choice.id='runningTerrainToggle';choice.textContent=enabled()?'Revenir au parcours actuel':'Essayer le parcours terrain';
    choice.disabled=busy;choice.onclick=()=>{savePrefs({...loadPrefs(),runningTerrain:!enabled()});phase=runningSessionId||hasValues()?'saisie':'preparation';message='';repaint(test);};
    const label=document.createElement('small');label.textContent='Essai 3×500 · barèmes inchangés';switchbar.append(label,choice);host.prepend(switchbar);
    host.classList.toggle('running-terrain',enabled());if(!enabled()){
      const contextPanel=toolPanel.querySelector('.eps-test-context');if(contextPanel)contextPanel.hidden=epsTestStarted;
      const edit=document.getElementById('epsEditPreparation');if(edit)edit.parentElement.hidden=false;
      const begin=document.getElementById('epsBegin');if(begin)begin.hidden=false;
      return;
    }
    if(context!==key()){context=key();phase=runningSessionId?'saisie':'preparation';const last=position();if(last&&Number.isInteger(last.group)&&last.group>=-1&&last.group<runningGroups.length)runningActiveGroup=last.group;}
    // Conserver les éléments et leurs écouteurs existants ; ne jamais dupliquer un champ.
    const setup=document.createElement('section');setup.className='running-terrain-preparation';setup.id='runningTerrainPreparation';
    const grid=host.querySelector('.running-grid-wrap'),result=host.querySelector('.running-result');
    const actions=host.querySelector('.tool-savebar'),danger=host.querySelector('.tool-dangerbar');
    const history=host.querySelector('.running-session-toolbar'),groups=host.querySelector('.running-group-tabs');
    const protocol=host.querySelector('.test-protocol'),settings=host.querySelector('.running-settings');
    for(const node of [protocol,settings,groups,document.getElementById('wfClassGroups')?.parentElement])if(node)setup.append(node);
    setup.hidden=phase!=='preparation';host.append(setup);
    const cls=toolClasses.find(c=>String(c.id)===String(toolClassId));
    const bar=document.createElement('section');bar.className='running-terrain-toolbar';
    bar.innerHTML=`<div><b>${toolHistoryEscape(cls?.name||'Utilisation libre')} · ${runningCount} × ${runningDistance} m</b><small>P${epsTestPeriod} · difficulté ${runningDifficulty>0?'+':''}${runningDifficulty} %</small></div><span class="running-terrain-step">${phase==='preparation'?'Préparation':phase==='saisie'?'Saisie des temps':'Bilan de séance'}</span>`;
    switchbar.after(bar);
    const outerContext=toolPanel.querySelector('.eps-test-context');
    if(outerContext)outerContext.hidden=phase!=='preparation';
    const classChoice=document.getElementById('toolClass');
    if(classChoice&&!classChoice.dataset.terrainGuard){classChoice.dataset.terrainGuard='true';classChoice.addEventListener('change',event=>{if(enabled()&&hasValues()&&!confirm('Changer de classe quitte les temps affichés. Enregistre la séance avant de changer si tu veux les conserver. Continuer ?')){event.stopImmediatePropagation();classChoice.value=toolClassId;}},true);}
    const legacyEdit=document.getElementById('epsEditPreparation');if(legacyEdit)legacyEdit.parentElement.hidden=true;
    const legacyBegin=document.getElementById('epsBegin');if(legacyBegin)legacyBegin.hidden=true;
    if(grid)grid.hidden=phase!=='saisie';if(result)result.hidden=phase!=='saisie';
    if(actions)actions.hidden=true;if(danger)danger.hidden=phase!=='preparation';
    if(history){history.hidden=phase!=='preparation';setup.append(history);}
    const button=(id,text,fn,secondary=false)=>{const b=document.createElement('button');b.type='button';b.id=id;b.textContent=text;if(secondary)b.className='secondary';b.disabled=busy;b.onclick=fn;return b;};
    if(phase==='preparation'){
      const begin=button('runningTerrainBegin',runningSessionId||hasValues()?'Reprendre la saisie':'Commencer le test',()=>{if(runningManageGroups){message='Enregistre ou annule la modification du groupe avant de commencer.';repaint(test);return;}setPhase('saisie',test);});
      setup.append(begin);
      // Le retour de modification garde les résultats et le groupe sélectionné.
      if(runningSessionId||hasValues())begin.classList.add('running-terrain-main-action');
    }
    if(phase==='saisie'){
      const controls=document.createElement('div');controls.className='running-terrain-controls';
      const select=document.createElement('select');select.id='runningTerrainGroup';select.setAttribute('aria-label','Groupe affiché');
      select.innerHTML='<option value="-1">Tous · ordre alphabétique</option>'+runningGroups.map((g,i)=>`<option value="${i}" ${runningActiveGroup===i?'selected':''}>Groupe ${i+1} · ${g.length} élèves</option>`).join('');select.value=String(runningActiveGroup);
      select.disabled=busy;select.onchange=()=>{runningActiveGroup=Number(select.value);remember();focusPending=false;repaint(test);};
      controls.append(select,button('runningTerrainEdit','Modifier la préparation / les groupes',()=>setPhase('preparation',test),true));bar.after(controls);
      const hint=document.createElement('p');hint.className='running-terrain-hint';hint.textContent='315 = 3 min 15 s · Entrée : course suivante, puis élève suivant';controls.after(hint);
      if(grid)hint.after(grid);if(result&&grid)grid.after(result);
      host.querySelectorAll('input[data-run-student]').forEach(input=>{
        input.disabled=busy;
        input.setAttribute('aria-label',`${studentLabel(toolStudents.find(s=>String(s.id)===String(input.dataset.runStudent)))} · course ${Number(input.dataset.runIndex)+1}`);
        input.addEventListener('focus',()=>remember(input));
        input.addEventListener('keydown',event=>{if(event.key!=='Enter'||event.isComposing)return;event.preventDefault();input.dispatchEvent(new Event('change',{bubbles:true}));if(input.value&&compactRunningSeconds(input.value)==null){input.setCustomValidity('Secondes comprises entre 00 et 59. Exemple : 315.');input.reportValidity();return;}input.setCustomValidity('');const fields=[...host.querySelectorAll('input[data-run-student]')];const next=fields[fields.indexOf(input)+(event.shiftKey?-1:1)];if(next){next.focus();next.select();next.scrollIntoView({block:'nearest',inline:'nearest'});}});
        input.addEventListener('input',()=>{input.setCustomValidity('');const progress=document.getElementById('runningTerrainProgress');if(progress){const s=stats();progress.textContent=`${s.complete} / ${s.total} élèves complets · ${s.started} commencés`;}});
      });
      const s=stats(),progress=document.createElement('p');progress.id='runningTerrainProgress';progress.className='running-terrain-progress';progress.textContent=`${s.complete} / ${s.total} élèves complets · ${s.started} commencés`;host.append(progress);
      const footer=document.createElement('div');footer.className='running-terrain-actions';
      if(onRealClass())footer.append(button('runningTerrainLater','Continuer plus tard',()=>save(test,false),true),button('runningTerrainFinish','Terminer la séance',()=>save(test,true)));
      const advanced=document.createElement('details');advanced.className='running-terrain-advanced';advanced.innerHTML='<summary>Autres actions · export, note finale, transfert</summary>';
      if(actions){actions.hidden=false;const originalSave=actions.querySelector('#runningSave');if(originalSave)originalSave.hidden=true;advanced.append(actions);}
      host.append(footer,advanced);
      const blank=document.getElementById('runningBlank');if(blank){const original=blank.onclick;blank.onclick=()=>{if(hasValues()&&!confirm('Commencer une nouvelle saisie sans les temps actuels ? Enregistre la séance si tu veux les conserver.'))return;original();};}
    }
    if(phase==='bilan'){
      const summary=document.createElement('section');summary.className='running-terrain-bilan';const s=stats();
      summary.innerHTML=`<h3>${toolHistoryEscape(message||'Séance enregistrée')}</h3><p>${s.complete} / ${s.total} élèves complets · ${s.total-s.complete} à compléter</p><p class="muted">Les résultats sont rangés dans Évaluations / Tests de cette classe. « Terminer » ne complète pas automatiquement les temps manquants.</p>`;
      summary.append(button('runningTerrainResume','Reprendre cette séance',()=>setPhase('saisie',test)),button('runningTerrainClass','Voir dans la classe',seeClass,true));host.append(summary);
    }
    const msg=document.createElement('p');msg.id='runningTerrainMessage';msg.setAttribute('role','status');msg.textContent=phase==='bilan'?'':message;host.append(msg);
    if(focusPending&&phase==='saisie'&&!runningManageGroups){focusPending=false;requestAnimationFrame(()=>restoreFocus(host));}
  }
  paintRunningSeriesTest=function(test){
    const oldHost=document.getElementById('epsTestBody');const oldScroll=oldHost?.querySelector('.running-grid-wrap')?.scrollLeft||0;const groupScroll=oldHost?.querySelector('.running-group-students')?.scrollTop||0;
    const focus=document.activeElement;if(enabled()&&!loading&&oldHost?.contains(focus)&&focus?.matches('input[data-run-student]')){remember(focus);focusPending=true;}
    basePaint(test);const host=document.getElementById('epsTestBody');if(host){apply(test,host);const grid=host.querySelector('.running-grid-wrap');if(grid)grid.scrollLeft=oldScroll;const groupList=host.querySelector('.running-group-students');if(groupList)groupList.scrollTop=groupScroll;}
  };
  resetRunningSession=function(...args){phase='preparation';context='';message='';focusPending=false;return baseReset(...args);};
  openRunningSession=async function(id,test){loading=true;try{await baseOpen(id,test);}finally{loading=false;}if(enabled()){phase='saisie';const last=position();if(last&&Number.isInteger(last.group)&&last.group>=-1&&last.group<runningGroups.length)runningActiveGroup=last.group;focusPending=true;repaint(test);}};
})();
