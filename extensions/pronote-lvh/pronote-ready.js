(() => {
  if (location.origin !== 'https://3500010j.index-education.net' || location.pathname !== '/pronote/professeur.html') return;
  let activeId = '', busy = false, wasLoggedIn = false;
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'EPS_PRONOTE_STOP' && message.id === activeId) { globalThis.EpsPronoteBridge.close?.(); activeId = ''; }
  });
  const authenticated = () => [...document.querySelectorAll('button,[role="button"]')].some(e => (e.getAttribute('aria-label') || e.textContent.trim()) === 'Se déconnecter');
  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const response = await chrome.runtime.sendMessage({type: 'EPS_PRONOTE_GET_PENDING'});
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
      const close = root?.getElementById('close'), original = close?.onclick;
      if (close) close.onclick = () => { original?.(); chrome.runtime.sendMessage({type: 'EPS_PRONOTE_CLEAR_PENDING', id: response.id}).catch(()=>{}); };
      root?.getElementById('navigate')?.click();
    } catch { /* Extension reload/disconnect: never initiate an unverified transfer. */ }
    finally { busy = false; }
  }
  refresh(); setInterval(refresh, 1000);
})();
