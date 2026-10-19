(() => {
  if (location.origin !== 'https://3500010j.index-education.net' || location.pathname !== '/pronote/professeur.html') return;
  let activeId = '', busy = false, wasLoggedIn = false, generation = 0;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type === 'EPS_PRONOTE_STOP') {
      generation++;
      if (message.id === activeId) { globalThis.EpsPronoteBridge.close?.(); activeId = ''; }
      respond?.({ok: true});
    }
  });
  document.addEventListener('click', event => {
    const path = event.composedPath();
    if (activeId && path.some(e => e.id === 'eps-pronote-bridge') && path.some(e => e.id === 'close')) {
      generation++;
      chrome.runtime.sendMessage({type: 'EPS_PRONOTE_CLEAR_PENDING', id: activeId, returnToEps: true}).catch(() => {});
    }
  });
  const authenticated = () => [...document.querySelectorAll('button,[role="button"]')].some(e => (e.getAttribute('aria-label') || e.textContent.trim()) === 'Se déconnecter');
  async function refresh() {
    if (busy) return;
    busy = true;
    const currentGeneration = generation;
    try {
      const response = await chrome.runtime.sendMessage({type: 'EPS_PRONOTE_GET_PENDING'});
      if (generation !== currentGeneration) return;
      const loggedIn = authenticated();
      if (wasLoggedIn && !loggedIn && activeId) {
        globalThis.EpsPronoteBridge.close?.();
        await chrome.runtime.sendMessage({type: 'EPS_PRONOTE_CLEAR_PENDING', id: activeId});
        activeId = ''; return;
      }
      wasLoggedIn = loggedIn;
      if (!response?.ok) { if (activeId) globalThis.EpsPronoteBridge.close?.(); activeId = ''; return; }
      if (!loggedIn || response.id === activeId) return;
      globalThis.EpsPronoteBridge.open(response.payload);
      activeId = response.id;
      const root = document.getElementById('eps-pronote-bridge')?.shadowRoot;
      const version = chrome.runtime.getManifest?.().version;
      if (version && root?.querySelector('h3')) root.querySelector('h3').textContent = 'Transfert EPS · version ' + version;
      root?.getElementById('navigate')?.click();
    } catch { /* Extension reload/disconnect: never initiate an unverified transfer. */ }
    finally { busy = false; }
  }
  refresh(); setInterval(refresh, 1000);
})();
