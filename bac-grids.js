/* All non-climbing BAC grids share one portable work format and the common group workflow. */
(()=>{
 'use strict';
 const W=()=>EpsToolWorkflow,M=()=>EpsBacGridsModel,esc=v=>W().esc(v),f=n=>n==null?'À compléter':n.toLocaleString('fr-FR',{maximumFractionDigits:2});
 function modal(title,body){const el=document.createElement('dialog');el.className='tool-action-dialog bac-degree-dialog';el.innerHTML=`<div class="tool-action-dialog-top"><h3>${esc(title)}</h3><button data-close class="secondary">Fermer</button></div>${body}`;document.body.append(el);el.querySelector('[data-close]').onclick=()=>el.close();el.onclose=()=>el.remove();el.showModal();return el}
 async function renderBacGridWeb(saved,activity){
  const owner=session?.user_id,host=toolPanel;let anchor=host.firstElementChild;
  const alive=()=>session?.user_id===owner&&toolPanel===host&&host.isConnected&&host.firstElementChild===anchor;
  const id=saved?.payload?.activity||activity,spec=EpsBacRubrics[id];
  if(!spec||saved?.payload?.rubricVersion>spec.version)throw Error('Référentiel non compatible : mettez l’application à jour. Le travail reste conservé.');
  await loadToolClasses();if(!alive())return;
  const state=W().stateFor(saved,{activity:id,rubricVersion:spec.version,studentIndex:0});
  if(!saved&&onRealClass()){state.classId=toolClassId;state.period=epsTestPeriod}
  let all=[];
  const value=s=>state.values[s.id]||{};
  const documentData=()=>({title:state.title||spec.label+' · Bac AFL1',context:(toolClasses.find(c=>c.id===state.classId)?.name||'Usage libre')+' · AFL1 /12 uniquement · Référentiel local',headers:['Élève',...spec.criteria.flatMap(c=>['Degré · '+c.title,'Base','Choix du barème',c.title+' /'+c.max]),'Paramètres','Observations','AFL1 /12'],rows:all.map(s=>{const v=value(s);return[studentLabel(s),...spec.criteria.flatMap((c,i)=>[v.degrees?.[i]==null?'':v.degrees[i]+1,M().base(spec,v,i)??'',c.choices?.[v.degrees?.[i]]?.[v.choices?.[i]]?.label||'',M().result(spec,v,i)?.score??'']),(spec.fields||[]).map(field=>field.label+': '+(field.options.find(o=>o[0]===v.params?.[field.key])?.[1]||'—')).join(' ; '),v.observation||'',M().total(spec,v)??'']})});
  async function draw(){
   all=await W().pupils(state);if(!alive())return;
   const list=W().visible(state,all);state.studentIndex=Math.max(0,Math.min(state.studentIndex||0,list.length-1));const s=list[state.studentIndex],v=s?value(s):{};
   host.innerHTML=toolHeader(spec.label+' · Bac EPS','AFL1 /12 · référentiel du lycée')+W().context(state)+W().groupsHtml(state,all)+`<section class="bac-grid-work"><details><summary>Protocole et calcul de la note</summary><p>${esc(spec.rule)}</p>${(spec.clarifications||[]).map(t=>`<p>${esc(t)}</p>`).join('')}<a href="bac_referentiels/${id}.pdf" target="_blank" rel="noopener">Référentiel complet</a></details>${!s?'<p>Aucun élève dans cet affichage.</p>':`<article class="bac-student"><header><div><h3>${esc(studentLabel(s))}</h3><span>${state.studentIndex+1} / ${list.length}</span></div></header>${spec.fields?.length?`<div class="bac-parameters">${spec.fields.map(field=>`<label>${esc(field.label)}<select data-bac-param="${field.key}"><option value="">Choisir</option>${field.options.map(([key,label])=>`<option value="${key}" ${v.params?.[field.key]===key?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`).join('')}</div>`:''}${spec.criteria.map((c,i)=>`<section class="bac-criterion"><div class="bac-criterion-head"><h3>${esc(c.title)}</h3><strong data-grid-score="${i}"></strong></div><div class="bac-degree-grid">${c.degrees.map((dg,d)=>`<div><button class="secondary bac-degree-title" data-grid-info="${i}:${d}">Degré ${d+1} ⓘ</button><button data-grid-note="${i}:${d}"></button></div>`).join('')}</div><p class="muted" data-grid-calc="${i}"></p><button class="secondary" data-grid-clear="${i}">Effacer ce critère</button></section>`).join('')}<label>Observations / mesures relevées<textarea id="bacObservation" rows="2">${esc(v.observation||'')}</textarea></label><footer aria-live="polite">Total AFL1 <strong id="bacGridTotal"></strong></footer></article><div class="bac-student-navigation"><button class="secondary" id="bacPrev" ${state.studentIndex===0?'disabled':''}>← Précédent</button><label>Élève<select id="bacStudent">${list.map((e,i)=>`<option value="${i}" ${i===state.studentIndex?'selected':''}>${esc(studentLabel(e))}</option>`).join('')}</select></label><button class="secondary" id="bacNext" ${state.studentIndex===list.length-1?'disabled':''}>Suivant →</button></div>`}</section>`+W().actions();
   anchor=host.firstElementChild;bindToolClose();W().bindContext(state,draw);W().bindGroups(state,draw);
   const change=next=>{if(!alive()||!s)return;state.values[s.id]=next;globalThis.EpsToolSave?.dirty();refresh()};
   function refresh(){if(!s)return;const now=value(s);host.querySelector('#bacGridTotal').textContent=f(M().total(spec,now))+' /12';host.querySelectorAll('[data-grid-score]').forEach(el=>{const i=+el.dataset.gridScore;el.textContent=f(M().result(spec,now,i)?.score)+' /'+spec.criteria[i].max});host.querySelectorAll('[data-grid-note]').forEach(b=>{const[i,d]=b.dataset.gridNote.split(':').map(Number),c=spec.criteria[i],chosen=now.degrees?.[i]===d; b.textContent=chosen?f(M().base(spec,now,i))+' ✓':c.choices?'Choisir':c.degrees[d].range.map(f).join(' à ');b.classList.toggle('secondary',!chosen);b.setAttribute('aria-pressed',String(chosen))});host.querySelectorAll('[data-grid-calc]').forEach(el=>{const i=+el.dataset.gridCalc,c=spec.criteria[i],d=now.degrees?.[i],choice=c.choices?.[d]?.[now.choices?.[i]];el.textContent=(choice?choice.label+' · ':'')+(M().result(spec,now,i)?.detail||(d==null?'Choisissez un degré puis la note.':'Complétez les paramètres du barème.'))})}
   if(s){
    host.querySelectorAll('[data-bac-param]').forEach(input=>input.onchange=()=>change({...value(s),params:{...value(s).params,[input.dataset.bacParam]:input.value}}));
    host.querySelector('#bacObservation').oninput=e=>change({...value(s),observation:e.target.value});
    host.querySelector('#bacStudent').onchange=e=>{state.studentIndex=+e.target.value;draw()};host.querySelector('#bacPrev').onclick=()=>{state.studentIndex--;draw()};host.querySelector('#bacNext').onclick=()=>{state.studentIndex++;draw()};
    host.querySelectorAll('[data-grid-info]').forEach(b=>b.onclick=()=>{const[i,d]=b.dataset.gridInfo.split(':').map(Number),c=spec.criteria[i];modal('Degré '+(d+1),`<h4>${esc(c.title)}</h4><div class="bac-description">${esc(c.degrees[d].text)}</div><p>${esc(spec.rule)}</p>`)});
    host.querySelectorAll('[data-grid-clear]').forEach(b=>b.onclick=()=>{if(confirm('Effacer uniquement ce critère ?'))change(M().setNote(value(s),+b.dataset.gridClear,null,null))});
    host.querySelectorAll('[data-grid-note]').forEach(b=>b.onclick=()=>{
     const[i,d]=b.dataset.gridNote.split(':').map(Number),c=spec.criteria[i],[lo,hi]=c.degrees[d].range,previous=value(s),selected=previous.degrees?.[i]===d;
     if(c.choices){const choices=c.choices[d],dlg=modal('Degré '+(d+1)+' · choisir la note',`<h4>${esc(c.title)}</h4><div class="bac-choice-list">${choices.map((o,k)=>`<button class="${selected&&previous.choices?.[i]===k?'':'secondary'}" data-choice="${k}">${esc(o.label)} <strong>${f(o.value)} pt</strong></button>`).join('')}</div><p>${esc(spec.rule)}</p>`);dlg.querySelectorAll('[data-choice]').forEach(button=>button.onclick=()=>{const k=+button.dataset.choice;change(M().setNote(value(s),i,d,choices[k].value,k));dlg.close()});return}
     const initial=selected?M().base(spec,previous,i)??lo:lo;
     const dlg=modal('Degré '+(d+1)+' · noter',`<h4>${esc(c.title)}</h4><label>Note de base /${c.max}<output>${f(initial)}</output><input id="bacGridSlider" type="range" min="${lo}" max="${hi}" step="0.05" value="${initial}"></label><div class="bac-range-ends"><span>${f(lo)}</span><span>${f(hi)}</span></div><p>La note est retenue au relâchement. ${c.adjust?'Les ajustements sont calculés ensuite.':''}</p><button data-validate>Valider cette note</button>`);
     const range=dlg.querySelector('input');range.oninput=()=>dlg.querySelector('output').textContent=f(+range.value);range.onchange=()=>change(M().setNote(value(s),i,d,+range.value));dlg.querySelector('[data-validate]').onclick=()=>{change(M().setNote(value(s),i,d,+range.value));dlg.close()};
    });refresh();
   }
   W().bindActions('bac-grid',state,draw,()=>W().csv('bac-'+id+'.csv',[documentData().headers,...documentData().rows]),()=>{state.studentIndex=0},renderBacGridWeb);
   EpsPronoteTools.attach(document.getElementById('wfExport'),()=>({classId:state.classId,className:toolClasses.find(c=>c.id===state.classId)?.name||'',title:state.title||spec.label+' · AFL1',bareme:12,scale:12,rows:all.map(s=>({student:s,score:M().total(spec,value(s)),scale:12}))}));
   EpsToolActionMenus.register(host.querySelector('.tool-savebar'),{document:documentData});
  }
  await draw();
 }
 globalThis.renderBacGridWeb=renderBacGridWeb;
})();
