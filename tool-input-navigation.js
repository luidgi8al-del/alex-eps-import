/* Entrée parcourt les critères, puis l'élève suivant, sans modifier les barèmes. */
(function(){
  'use strict';
  const fields=table=>[...table.querySelectorAll('tbody input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]),tbody select')].filter(n=>!n.disabled&&!n.readOnly&&n.getClientRects().length&&!n.closest('[hidden]'));
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'||e.isComposing||e.ctrlKey||e.altKey||e.metaKey)return;
    const input=e.target;if(!(input instanceof HTMLInputElement)||['checkbox','radio','range','button','submit'].includes(input.type))return;
    const panel=input.closest('#toolPanel'),table=input.closest('table');if(!panel||!table||input.closest('[role=dialog]'))return;
    e.preventDefault();
    if(!input.checkValidity()){input.reportValidity();return}
    const tables=[...panel.querySelectorAll('table')],tableIndex=tables.indexOf(table),list=fields(table),index=list.indexOf(input);
    if(index<0)return;
    // Les outils qui redessinent leur tableau à la validation sont aussi pris en charge.
    input.dispatchEvent(new Event('change',{bubbles:true}));
    requestAnimationFrame(()=>{
      const current=panel.querySelectorAll('table')[tableIndex];if(!current)return;
      const next=fields(current)[index+(e.shiftKey?-1:1)];
      if(next){next.focus({preventScroll:true});next.scrollIntoView({block:'nearest',inline:'nearest'});if(next instanceof HTMLInputElement)next.select()}
      else if(!e.shiftKey)input.blur();
    });
  });
})();
