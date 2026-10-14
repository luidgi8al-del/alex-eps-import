/* One header for class-based tools. Keep hidden period values and their handlers for persistence. */
(function(){
 const classIds=['toolClass','wfClass','modernClass','fitnessClass','swimObsClass','gymObsClass','twClass'];
 const periodIds=['wfPeriod','modernPeriod','fitnessPeriod','swimObsPeriod','gymObsPeriod','vmaPeriod'];
 const fallbacks=new Map();let scheduled=false;
 const activePanel=()=>typeof toolPanel!=='undefined'&&toolPanel?.isConnected?toolPanel:document.getElementById('toolPanel');
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const stripPeriod=s=>String(s).replace(/\s*·?\s*(?:Période\s*|P)\d+\b/gi,'').trim();
 function selector(id,value){return `<div class="running-header-class"><label for="${id}">Classe</label><select id="${id}"><option value="">Usage libre (sans classe)</option>${toolClasses.map(c=>`<option value="${esc(c.id)}" ${String(c.id)===String(value)?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>`}
 async function periodForClass(id){const cls=toolClasses.find(c=>String(c.id)===String(id));if(!cls)return 1;if(cls.grade==='TERMINALE')try{await loadPeriodDates()}catch{}return ecPeriodeDuJour(cls.grade)}
 function register(id,change){fallbacks.set(id,change)}
 function hideOnlyContext(container){
  if(!container||container.classList.contains('modern-tool-hero')||container.classList.contains('running-header-class'))return;
  const live=[...container.querySelectorAll('input,select,textarea,button,summary')].some(n=>n.type!=='hidden'&&!n.hidden&&!n.closest('[hidden]'));
  if(!live)container.hidden=true;
 }
 function attach(){
  const panel=activePanel(),hero=panel?.querySelector('.modern-tool-hero');if(!hero)return;
  const cls=classIds.map(id=>panel.querySelector('#'+id)).find(Boolean);if(!cls)return;
  const oldParent=cls.parentElement,card=cls.closest('.card,.wf-setup-context,.tool-context');
  hero.classList.add('modern-tool-with-context');
  if(!hero.contains(cls)){
   const context=document.createElement('div');context.className='running-header-class';const label=document.createElement('label');label.htmlFor=cls.id;label.textContent='Classe';context.append(label,cls);hero.querySelector('.tool-close-controls').before(context);
   if(oldParent.tagName==='LABEL')oldParent.hidden=true;hideOnlyContext(oldParent);hideOnlyContext(card);
  }
  const subtitle=hero.querySelector('p');if(subtitle){const clean=stripPeriod(subtitle.textContent);if(subtitle.textContent!==clean)subtitle.textContent=clean;}
  periodIds.forEach(id=>{const p=panel.querySelector('#'+id);if(!p)return;const label=p.closest('label');if(label)label.hidden=true;else p.hidden=true;hideOnlyContext(label?.parentElement)});
  panel.querySelectorAll('[data-eps-period]').forEach(b=>{b.hidden=true;const row=b.closest('.periodBar');if(row){row.hidden=true;if(row.previousElementSibling?.tagName==='LABEL')row.previousElementSibling.hidden=true;}});
  panel.querySelectorAll('.fitness-kpi').forEach(k=>{if(/^P\d+$/.test(k.querySelector('strong')?.textContent.trim()||''))k.hidden=true});
  if(cls.dataset.compactBound)return;
  cls.dataset.compactBound='true';const original=cls.onchange,kind=cls.id,title=hero.querySelector('h2')?.textContent,owner=session?.user_id;
  cls.onchange=async event=>{
   if(session?.user_id!==owner){alert('Le compte a changé. Rouvrez cet outil depuis Outils.');return;}
   const requested=cls.value;
   if(original)await original(event);else if(fallbacks.has(kind))await fallbacks.get(kind)(requested);
   const currentPanel=activePanel();if(currentPanel!==panel)return;
   const current=currentPanel.querySelector('#'+kind),currentHero=currentPanel.querySelector('.modern-tool-hero');
   if(session?.user_id!==owner||current?.value!==requested||currentHero?.querySelector('h2')?.textContent!==title)return;
   const number=await periodForClass(requested);if(session?.user_id!==owner)return;
   const period=periodIds.map(id=>currentPanel.querySelector('#'+id)).find(Boolean);
   if(period&&+period.value!==number){period.value=String(number);period.dispatchEvent(new Event('change',{bubbles:true}));}
   attach();
  };
 }
 function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;attach()},0)}
 new MutationObserver(changes=>{if(changes.some(m=>m.target.closest?.('#toolPanel,#liveToolPanel')||[...m.addedNodes].some(n=>n.id==='liveToolPanel')))schedule()}).observe(document.body,{childList:true,subtree:true});
 globalThis.EpsCompactTools={selector,register,periodForClass,attach,stripPeriod};
})();
