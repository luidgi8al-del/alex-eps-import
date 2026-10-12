/* Organisation commune aux outils : composition transactionnelle, résultats inchangés. */
(function(){
  'use strict';
  const rosters=new WeakMap(),esc=EpsToolWorkflow.esc;
  const assigned=(state,id)=>String(state.assignments[id]||'');
  function eligible(state,group,students){return students.filter(s=>!assigned(state,s.id)||assigned(state,s.id)===String(group));}
  function composition(state,group,members){
    const assignments={...state.assignments};
    Object.keys(assignments).forEach(id=>{if(String(assignments[id])===String(group))delete assignments[id]});
    members.forEach(id=>assignments[id]=state.numericGroups?Number(group):String(group));
    return assignments;
  }
  function nextId(state){return String(Math.max(0,...state.groups.map(g=>Number(g.id)||0))+1);}
  function html(state,students){
    rosters.set(state,students);
    const library=state.inTest?'':globalThis.EpsClassGroups?.controls(state)||'';
    const tabs=`<div class="running-group-tabs common-group-tabs"><button type="button" data-tool-group="" class="${state.activeGroup?'secondary':''}">Sans groupe · ordre alphabétique</button>${state.groups.map(g=>`<button type="button" data-tool-group="${esc(g.id)}" class="${String(state.activeGroup)===String(g.id)?'':'secondary'}"><span>${esc(g.name)} · ${students.filter(s=>assigned(state,s.id)===String(g.id)).length}</span><small>Appui prolongé : modifier</small></button>`).join('')}</div>`;
    // Le sélecteur caché conserve le contrat des anciens adaptateurs, les boutons sont visibles.
    return `<section class="field-tool-card common-groups ${state.groups.length?'common-groups-ready':''}">${library}<select id="wfGroup" hidden aria-hidden="true" tabindex="-1"><option value="">Tous</option>${state.groups.map(g=>`<option value="${esc(g.id)}" ${String(state.activeGroup)===String(g.id)?'selected':''}>${esc(g.name)}</option>`).join('')}</select>${tabs}<div class="common-group-commands"><button type="button" class="secondary" data-tool-create-group>＋ Groupe libre</button><button type="button" class="secondary" id="wfEditGroups">Modifier les groupes</button><details><summary>Répartition automatique</summary><label>Élèves par groupe<input id="wfAutoGroupSize" type="number" min="1" max="30" value="${Math.max(1,+state.autoGroupSize||4)}"></label><button type="button" class="secondary" id="wfAutoGroups">Répartir</button><div class="common-group-presets">${[2,3,4].map(n=>`<button type="button" class="secondary" data-wf-group-preset="${n}">${n} groupes</button>`).join('')}</div></details></div></section>`;
  }
  function editor(state,group,draw){
    document.getElementById('commonToolGroupOverlay')?.remove();
    const students=rosters.get(state)||[],existing=state.groups.find(g=>String(g.id)===String(group));
    const id=existing?.id??nextId(state),members=new Set(students.filter(s=>assigned(state,s.id)===String(id)).map(s=>String(s.id)));
    const available=eligible(state,existing?id:null,students),previousFocus=document.activeElement;
    const overlay=document.createElement('div');overlay.id='commonToolGroupOverlay';overlay.className='running-group-overlay common-tool-group-overlay';
    overlay.innerHTML=`<section class="running-group-editor" role="dialog" aria-modal="true" aria-labelledby="commonGroupTitle"><h3 id="commonGroupTitle">${existing?'Modifier':'Créer'} le groupe</h3><label>Nom du groupe<input id="commonGroupName" maxlength="80" ${state.fixedNames?'readonly':''} value="${esc(existing?.name||'Groupe '+(state.groups.length+1))}"></label><p>Décochez pour remettre un élève sans groupe. Cochez un élève disponible pour l’ajouter. Les résultats sont conservés.</p><div class="running-group-students">${available.map(s=>`<label><input type="checkbox" data-tool-group-member="${esc(s.id)}" ${members.has(String(s.id))?'checked':''}><span>${esc(studentLabel(s))}</span></label>`).join('')||'<p>Aucun élève disponible. Retirez-le d’abord de son groupe actuel.</p>'}</div><p data-group-message role="status"></p><div class="running-group-actions"><button type="button" data-group-save>Enregistrer</button><button type="button" class="secondary" data-group-cancel>Annuler</button>${existing?'<button type="button" class="danger" data-group-delete>Supprimer ce groupe</button>':''}</div></section>`;
    document.body.append(overlay);
    const close=()=>{document.removeEventListener('keydown',keyboard,true);overlay.remove();if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true})};
    const keyboard=e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}
      if(e.key==='Tab'){const nodes=[...overlay.querySelectorAll('input,button')].filter(n=>!n.disabled);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}
    };
    document.addEventListener('keydown',keyboard,true);
    overlay.onclick=e=>{if(e.target===overlay)close()};overlay.querySelector('[data-group-cancel]').onclick=close;
    overlay.querySelectorAll('[data-tool-group-member]').forEach(box=>box.onchange=()=>{if(box.checked)members.add(box.dataset.toolGroupMember);else members.delete(box.dataset.toolGroupMember)});
    overlay.querySelector('[data-group-save]').onclick=async()=>{
      if(!existing&&!members.size){overlay.querySelector('[data-group-message]').textContent='Sélectionnez au moins un élève.';return}
      const name=overlay.querySelector('#commonGroupName').value.trim()||'Groupe '+(state.groups.length+1);
      if(state.nameIds&&state.groups.some(g=>String(g.id)!==String(id)&&g.name===name)){overlay.querySelector('[data-group-message]').textContent='Ce nom de groupe existe déjà.';return}
      state.assignments=composition(state,id,members);
      if(existing)existing.name=name;else state.groups.push({id,name});state.activeGroup=String(id);state.editGroups=false;close();await draw();
    };
    overlay.querySelector('[data-group-delete]')?.addEventListener('click',async()=>{
      if(!confirm('Supprimer ce groupe ? Les résultats seront conservés.'))return;
      state.assignments=composition(state,id,[]);state.groups=state.groups.filter(g=>String(g.id)!==String(id));if(String(state.activeGroup)===String(id))state.activeGroup='';state.editGroups=false;close();await draw();
    });
    overlay.querySelector('#commonGroupName').focus({preventScroll:true});
  }
  function bind(state,draw){
    const students=rosters.get(state)||[];
    EpsClassGroups?.bind(state,students,draw);
    const host=toolPanel.querySelector('.common-groups');if(!host)return;
    let ignoreUntil=0;
    const redraw=async()=>{const y=scrollY,panelY=toolPanel.scrollTop;toolPanel.inert=true;try{await draw()}finally{toolPanel.inert=false}requestAnimationFrame(()=>{scrollTo(0,y);toolPanel.scrollTop=panelY})};
    const tabs=host.querySelectorAll('[data-tool-group]');
    tabs.forEach(b=>b.onclick=()=>{if(Date.now()<ignoreUntil)return;state.activeGroup=b.dataset.toolGroup;state.editGroups=false;redraw()});
    bindRunningLongPress(host.querySelectorAll('[data-tool-group]:not([data-tool-group=""])'),b=>{ignoreUntil=Date.now()+800;editor(state,b.dataset.toolGroup,redraw)});
    host.querySelector('[data-tool-create-group]').onclick=()=>editor(state,null,redraw);
    host.querySelector('#wfGroup').onchange=e=>{state.activeGroup=e.target.value;redraw()};
    host.querySelector('#wfEditGroups').onclick=()=>{
      const group=state.groups.find(g=>String(g.id)===String(state.activeGroup))||state.groups[0];editor(state,group?.id??null,redraw);
    };
    const auto=count=>{
      if(state.groups.length&&!confirm('Remplacer la composition actuelle ? Les résultats sont conservés.'))return;
      if(!students.length)return;
      const previous=structuredClone({groups:state.groups,assignments:state.assignments,activeGroup:state.activeGroup});
      count=Math.min(students.length,Math.max(1,count));state.groups=Array.from({length:count},(_,i)=>({id:String(i+1),name:'Groupe '+(i+1)}));state.assignments={};
      students.forEach((s,i)=>state.assignments[s.id]=state.numericGroups?(i%count)+1:String((i%count)+1));state.activeGroup='1';state.editGroups=false;
      redraw().then(()=>EpsToolWorkflow.offerUndo(async()=>{Object.assign(state,previous);await redraw()}));
    };
    host.querySelector('#wfAutoGroups').onclick=()=>{state.autoGroupSize=Math.max(1,Math.min(30,+host.querySelector('#wfAutoGroupSize').value||4));auto(Math.ceil(students.length/state.autoGroupSize))};
    host.querySelectorAll('[data-wf-group-preset]').forEach(b=>b.onclick=()=>auto(+b.dataset.wfGroupPreset));
  }
  globalThis.EpsToolGroups={html,bind,editor,eligible,composition};
})();
