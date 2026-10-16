/* Read-only onboarding: only its own per-account preference is persisted. */
(function(){
 let catalog=null,active=null,root=null,position=-1,scheduled=false;
 const states=new Map(),key=(owner,topic)=>`eps_section_guide:v1:${owner}:${topic}`;
 const visible=e=>!!e&&e.getClientRects().length>0&&!e.closest('[hidden]');
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function context(){
  const manager=document.getElementById('managerPage');
  if(manager)return visible(manager)&&manager.dataset.guideOwner?{topic:'manager',owner:manager.dataset.guideOwner,host:manager.querySelector('main')}:null;
  if(typeof session==='undefined'||!session?.user_id)return null;
  const settings=document.getElementById('settingsOverlay');
  if(settings?.classList.contains('open'))return {topic:'settings',owner:session.user_id,host:document.getElementById('settingsBody')};
  const topic=typeof currentWebTab!=='undefined'?currentWebTab:null;
  const host=document.getElementById('tab-'+(topic==='planning'?'programmation':topic));
  if(!visible(host))return null;
  // A tool's own guide takes priority; don't put two invitations above a worksheet.
  if(topic==='outils'&&visible(document.getElementById('toolPanel')))return null;
  return {topic:topic==='classes'&&visible(document.getElementById('classDashboardPanel'))?'class-detail':topic,owner:session.user_id,host};
 }
 function acknowledge(ctx){try{localStorage.setItem(key(ctx.owner,ctx.topic),'done')}catch{}setPosition(-2)}
 function setPosition(value){position=value;states.set(active,value);render(true)}
 function render(focus=false){
  const ctx=context();if(!catalog||!ctx?.host||!catalog[ctx.topic]){root?.remove();root=null;active=null;return}
  const id=key(ctx.owner,ctx.topic);
  if(active!==id){active=id;let seen=false;try{seen=localStorage.getItem(id)==='done'}catch{}position=states.get(id)??(seen?-2:-1);root?.remove();root=null}
  if(root?.isConnected&&root.parentElement===ctx.host&&!focus)return;
  root?.remove();root=document.createElement('section');root.className='section-guide';root.dataset.guideTopic=ctx.topic;root.setAttribute('aria-label','Prise en main · '+catalog[ctx.topic].title);
  const topic=catalog[ctx.topic],step=topic.steps[position];
  root.innerHTML=`<div class="section-guide-head"><span>${position===-2?'':esc(topic.title)+' · '+(position===-1?'Première utilisation ?':`${position+1} / ${topic.steps.length}`)}</span><button type="button" class="secondary" data-section-help aria-expanded="${position!==-2}">? Aide</button></div>${position===-2?'':`<div class="section-guide-content">${position===-1?'<p>Un guide court pour vous repérer, sans modifier vos données.</p>':`<strong tabindex="-1">${esc(step[0])}</strong><p>${esc(step[1])}</p>`}<div class="section-guide-actions">${position===-1?'<button type="button" data-section-start>Me guider</button><button type="button" class="secondary" data-section-done>J’ai compris</button>':`${position>0?'<button type="button" class="secondary" data-section-back>Précédent</button>':''}<button type="button" data-section-next>${position===topic.steps.length-1?'J’ai compris':'Suivant'}</button>`}<button type="button" class="secondary" data-section-exit>${position===-1?'Plus tard':'Quitter le guide'}</button></div></div>`}`;
  ctx.host.prepend(root);
  root.querySelector('[data-section-help]').onclick=()=>setPosition(-1);
  root.querySelector('[data-section-start]')?.addEventListener('click',()=>setPosition(0));
  root.querySelector('[data-section-exit]')?.addEventListener('click',()=>setPosition(-2));
  root.querySelector('[data-section-done]')?.addEventListener('click',()=>acknowledge(ctx));
  root.querySelector('[data-section-back]')?.addEventListener('click',()=>setPosition(position-1));
  root.querySelector('[data-section-next]')?.addEventListener('click',()=>position===topic.steps.length-1?acknowledge(ctx):setPosition(position+1));
  if(focus){const target=root.querySelector('strong')||root.querySelector('[data-section-help]');target.focus({preventScroll:true});root.scrollIntoView({block:'nearest'})}
 }
 function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;render()},0)}
 new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style','hidden','class','data-guide-owner']});
 fetch('section-guides.json?v=20261016-1').then(r=>{if(!r.ok)throw Error('Guide unavailable');return r.json()}).then(data=>{catalog=data;render()}).catch(()=>{/* Help must never block the application. */});
 globalThis.EpsSectionGuides={refresh:schedule};
})();
