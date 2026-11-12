/* Same-document history for the website and installed PWA. No personal data in history. */
(function () {
  let account = null, current = null, replay = false, transition = false, restoring = false;
  const main = document.getElementById('mainView');
  const owner = () => typeof session !== 'undefined' ? session?.user_id : null;
  const active = () => !!owner() && main.style.display !== 'none';
  const panels = () => [...document.querySelectorAll('#toolPanel,#liveToolPanel')];
  const openPanel = () => panels().find(p => p.innerHTML.trim() && p.style.display !== 'none' && p.getClientRects().length);
  const route = (tab, tool = false) => ({epsNavigation:1, tab, tool, scroll:0});
  function replace(state) { current = state; history.replaceState(state, '', '#' + state.tab); }
  function rememberScroll() { if(current) replace({...current,scroll:window.scrollY}); }
  function tab(name) {
    if(!active() || replay) return;
    if(account !== owner() || !current) { account = owner(); transition = false; replace(route(name)); return; }
    if(transition || current.tab === name) return;
    rememberScroll(); current = route(name); history.pushState(current, '', '#' + name);
  }
  function toolOpened() {
    if(!active() || replay || restoring || !current) return;
    const panel = openPanel();
    if(panel && !current.tool) {
      rememberScroll();
      current = route(typeof currentWebTab !== 'undefined' ? currentWebTab : current.tab, true);
      history.pushState(current, '', '#' + current.tab); transition = false;
    } else if(!panel && current.tool && !transition) {
      // The visible Fermer action returns to the same origin as the phone Back button.
      restoring = true; history.back();
    }
  }
  function beginToolTransition() { if(active()) { rememberScroll(); transition = true; } }
  function cancelToolTransition() { transition = false; if(active() && current && current.tab !== currentWebTab) { replay = true; try { showTab(current.tab,{skipModuleStart:true}); } finally { replay = false; } } }
  function workspace(view) {
    if(!active() || replay || transition || !current || current.tab !== 'outils' || current.tool) return;
    if(!current.workspace) { replace({...current,workspace:view}); return; }
    if(JSON.stringify(current.workspace) === JSON.stringify(view)) return;
    const sameGroup = current.workspace.activity === view.activity && current.workspace.showFavorites === view.showFavorites;
    rememberScroll();
    const next = {...route('outils'),workspace:view};
    if(sameGroup) replace(next); else { current=next; history.pushState(next,'','#outils'); }
  }
  window.addEventListener('popstate', e => {
    if(!active() || account !== owner()) return;
    const target = e.state;
    if(!target?.epsNavigation) return;
    if(restoring) restoring = false;
    const panel = openPanel();
    if(panel && !target.tool && globalThis.EpsToolSave?.hasUnsaved?.() && !confirm('Des modifications ne sont pas enregistrées. Revenir à l’écran précédent ? Enregistrez d’abord pour les conserver.')) {
      restoring = true; history.forward(); return;
    }
    current = target; transition = false; replay = true;
    try {
      if(panel && !target.tool) closeModernTool();
      // Existing DOM retains the previous list, class selection and filters.
      showTab(target.tab,{skipModuleStart:true});
      if(target.tab === 'outils' && !target.tool && target.workspace) globalThis.restoreToolsWorkspaceNavigation?.(target.workspace);
      if(target.tool && !openPanel()) {
        // A tool explicitly closed by the user must not reappear as an empty panel on Forward.
        replace(route(target.tab));
        if(target.tab === 'outils') resetToolsWorkspace();
      }
      requestAnimationFrame(()=>window.scrollTo(0,target.scroll || 0));
    } finally { replay = false; }
  });
  new MutationObserver(()=>{
    if(!active()) { account = null; current = null; transition = false; return; }
    toolOpened();
  }).observe(main,{childList:true,subtree:true,attributes:true,attributeFilter:['style','hidden']});
  globalThis.EpsNavigation = {tab,workspace,beginToolTransition,cancelToolTransition};
  if(active()) tab(typeof currentWebTab !== 'undefined' ? currentWebTab : 'home');
})();
