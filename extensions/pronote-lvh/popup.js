document.getElementById('diagnostic').onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    if (url.origin !== 'https://3500010j.index-education.net' || !url.pathname.startsWith('/pronote/')) throw Error('Ouvrez le PRONOTE du lycée Victor Hugo dans cet onglet.');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['diagnostic.js'] });
    window.close();
  } catch (e) { document.getElementById('status').textContent = e.message; }
};

chrome.runtime.sendMessage({ type: 'EPS_PRONOTE_GET_PENDING' }).then(response => {
  if (!response?.ok || !response.payload) return;
  document.getElementById('payload').value = JSON.stringify(response.payload);
  document.getElementById('status').textContent = 'Transfert préparé depuis le site EPS.';
}).catch(() => {});
document.getElementById('open').onclick = async () => {
  const status = document.getElementById('status');
  try {
    const payload = JSON.parse(document.getElementById('payload').value);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    if (url.origin !== 'https://3500010j.index-education.net' || !url.pathname.startsWith('/pronote/')) {
      throw Error('Ouvrez le PRONOTE du lycée Victor Hugo dans cet onglet.');
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['bridge.js'] });
    const result = await chrome.scripting.executeScript({ target: { tabId: tab.id },
      func: data => { try { globalThis.EpsPronoteBridge.open(data); return ''; } catch (e) { return e.message; } }, args: [payload] });
    if (result[0]?.result) throw Error(result[0].result);
    window.close();
  } catch (e) { status.textContent = e.message; }
};
