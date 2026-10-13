(function(){
 const groups=[['account','Mon compte',['profileSection','gmailSection','accountSection','privacySection','periodSection']],['sync','Synchronisation et sauvegarde',['offlineSection','backupSection','webTrashSection']],['visual','Affichage',['visualSection','toolsLayoutSection']],['admin','Administration',['teacherAdminSection','resetSection']]];
 let selected='account';
 function organise(){
  const body=document.getElementById('settingsBody');if(!body?.querySelector('#profileSection'))return;
  if(!body.querySelector('#settingsCategories')){
   if(body.querySelector('#visualSection')?.open)selected='visual';
   const nav=document.createElement('div');nav.id='settingsCategories';nav.className='settings-category-nav';nav.setAttribute('role','group');nav.setAttribute('aria-label','Rubriques des réglages');
   groups.forEach(([id,label])=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.settingsCategory=id;b.onclick=()=>{selected=id;apply(body)};nav.append(b)});body.prepend(nav);
  }
  groups.forEach(([id,,ids])=>ids.forEach(name=>{const node=document.getElementById(name);if(!node)return;if(node.parentElement!==body)body.append(node);node.dataset.settingsGroup=id;}));apply(body);
 }
 function apply(body){body.querySelectorAll('[data-settings-group]').forEach(node=>{const visible=node.dataset.settingsGroup===selected;node.hidden=!visible;if(!visible)node.open=false});body.querySelectorAll('[data-settings-category]').forEach(b=>{const active=b.dataset.settingsCategory===selected;b.classList.toggle('secondary',!active);b.setAttribute('aria-pressed',String(active))});}
 new MutationObserver(organise).observe(document.getElementById('settingsBody'),{childList:true});
 globalThis.EpsSettingsCategories={organise};
})();
