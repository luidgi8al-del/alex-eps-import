/* Only a completed save of the current tool may acknowledge the edited screen. */
(function(){
  let generation=0,revision=0,savedRevision=-1,confirmed=false,batch=null,detail={};
  const labels={red:'Pas encore enregistré : utilisez Enregistrer avant de fermer.',orange:'Enregistré sur cet appareil, pas encore synchronisé.',green:'Enregistré et synchronisé.'};
  function colour(){return savedRevision!==revision?'red':confirmed?'green':'orange'}
  function render(){document.querySelectorAll('.tool-save-indicator').forEach(dot=>{const c=colour();dot.dataset.state=c;dot.setAttribute('aria-label',labels[c]);dot.title=labels[c];dot.onclick=()=>alert(labels[colour()]);});}
  function reset(){generation++;revision=0;savedRevision=-1;confirmed=false;batch=null;render()}
  function dirty(){revision++;confirmed=false;render()}
  function written(queued){if(batch){batch.writes++;batch.queued ||= queued}}
  function failed(){if(batch)batch.failed=true;confirmed=false;render()}
  function begin(){const token={generation,revision,started:Date.now(),writes:0,queued:false,failed:false};batch=token;return token}
  function finish(token){if(batch===token)batch=null;if(token.generation!==generation||token.revision!==revision||token.failed||!token.writes){render();return}savedRevision=revision;confirmed=!token.queued||(detail.state==='synced'&&!detail.pending&&!detail.conflicts&&Date.parse(detail.at)>=token.started);render()}
  function sync(value){detail=value||{};if(detail.pending||detail.conflicts||detail.state==='error')confirmed=false;if(savedRevision===revision&&detail.state==='synced'&&!detail.pending&&!detail.conflicts&&!batch)confirmed=true;render()}
  function install(){
    const panel=typeof toolPanel!=='undefined'?toolPanel:null;if(!panel)return;
    panel.querySelectorAll('button').forEach(button=>{
      if(!/^(?:💾\s*)?Enregistrer$/.test(button.textContent.trim())||typeof button.onclick!=='function'||button.onclick.__saveIndicator)return;
      const original=button.onclick;const handler=async function(event){const token=begin();try{const result=await original.call(this,event);finish(token);return result}catch(error){token.failed=true;finish(token);throw error}};handler.__saveIndicator=true;button.onclick=handler;
    });render();
  }
  document.addEventListener('input',event=>{if(event.target.closest('#toolPanel,#liveToolPanel')&&!event.target.closest('.tool-save-indicator'))dirty()},true);
  document.addEventListener('change',event=>{if(event.target.closest('#toolPanel,#liveToolPanel'))dirty()},true);
  document.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b||!b.closest('#toolPanel,#liveToolPanel'))return;
    if(b.parentElement?.classList.contains('tool-direct-actions')&&/Nouvelle saisie/.test(b.textContent))return;
    if(b.matches('[data-stop-plus],[data-stop-minus],[data-stop-student],[data-stop-moins],[data-obs-inc],[data-obs-dec],[data-climb-observe],[data-swim-step],[data-impact-action],.socle-colour-cell,#runningSaveGroup,#runningDeleteGroup,#runningAutoGroups,[data-group-save],[data-group-delete]')||/Réinitialiser|Nouvelle saisie|Remise à zéro|Enregistrer le groupe|Créer le groupe/.test(b.textContent))dirty();
  },true);
  window.addEventListener('eps:pwa-sync-state',e=>sync(e.detail));
  window.addEventListener('online',()=>render());window.addEventListener('offline',()=>render());
  new MutationObserver(install).observe(document.body,{subtree:true,childList:true});
  globalThis.EpsToolSave={reset,dirty,written,failed,begin,finish,sync,colour,render};
  install();
})();
