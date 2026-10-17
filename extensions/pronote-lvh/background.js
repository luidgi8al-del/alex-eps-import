const PRONOTE_URL = 'https://3500010j.index-education.net/pronote/professeur.html';
const MAX_TRANSFER_AGE_MS = 60 * 60 * 1000;
let opening = false;
function allowed(url, kind) {
  try {
    const u = new URL(url);
    return kind === 'eps' ? u.origin === 'https://luidgi8al-del.github.io' && u.pathname.startsWith('/alex-eps-import/')
      : u.origin === 'https://3500010j.index-education.net' && u.pathname === '/pronote/professeur.html';
  } catch { return false; }
}
function popup(sender) { return !sender.tab && sender.url === chrome.runtime.getURL('popup.html'); }
function topPage(sender, kind) { return sender.frameId === 0 && sender.tab && allowed(sender.url, kind) && allowed(sender.tab.url, kind); }
function validPayload(data) {
  if (data?.format !== 'eps-pronote-v1' || !Array.isArray(data.rows) || !data.rows.length || data.rows.length > 200 || !(Number(data.scale) > 0 && Number(data.scale) <= 1000)) throw Error('Transfert EPS invalide.');
  for (const field of ['className', 'title', 'date']) if (typeof data[field] !== 'string' || !data[field].trim() || data[field].length > 500) throw Error('Classe, titre ou date manquants.');
  for (const row of data.rows) {
    if (!row || typeof row.lastName !== 'string' || typeof row.firstName !== 'string' || !row.lastName.trim() || !row.firstName.trim() || row.lastName.length > 200 || row.firstName.length > 200 || typeof row.value !== 'string' || !/^(?:|A|D|\d+(?:[,.]\d+)?)$/.test(row.value) || (/^\d/.test(row.value) && Number(row.value.replace(',', '.')) > Number(data.scale))) throw Error('Élève ou note invalide.');
  }
  return { format: data.format, className: data.className, title: data.title, date: data.date, scale: Number(data.scale), coefficient: Number(data.coefficient ?? 1), rows: data.rows.map(({lastName, firstName, value}) => ({lastName, firstName, value})) };
}
async function start(sender, raw) {
  if (!topPage(sender, 'eps')) throw Error('Page EPS non autorisée.');
  if (opening) throw Error('Une ouverture de PRONOTE est déjà en cours.');
  const payload = validPayload(raw);
  opening = true;
  try {
    const {epsPronotePending: previous} = await chrome.storage.session.get('epsPronotePending');
    if (previous && Date.now() - previous.createdAt < MAX_TRANSFER_AGE_MS && await chrome.tabs.get(previous.tabId).then(t=>allowed(t.url,'pronote'),()=>false)) throw Error('Un transfert est déjà ouvert. Fermez son panneau PRONOTE avant d’en préparer un autre.');
    const candidates = (await chrome.tabs.query({url: 'https://3500010j.index-education.net/pronote/*'})).filter(t => allowed(t.url, 'pronote'));
    // Reuse only an unambiguous tab; never choose between two logged-in sessions.
    const tab = candidates.length === 1 ? candidates[0] : await chrome.tabs.create({url: PRONOTE_URL, active: true});
    await chrome.storage.session.set({epsPronotePending: {payload, id: crypto.randomUUID(), createdAt: Date.now(), tabId: tab.id, sourceTabId: sender.tab.id}});
    await chrome.tabs.update(tab.id, {active: true});
    await chrome.windows.update(tab.windowId, {focused: true});
    return {ok: true, protocol: 2, mode: candidates.length === 1 ? 'existing-tab' : 'new-tab'};
  } finally { opening = false; }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'EPS_PRONOTE_SPLIT') return start(sender, message.payload);
    if (!['EPS_PRONOTE_GET_PENDING', 'EPS_PRONOTE_CLEAR_PENDING'].includes(message?.type)) return {ok: false};
    if (!popup(sender) && !topPage(sender, 'pronote')) return {ok: false};
    const {epsPronotePending: pending} = await chrome.storage.session.get('epsPronotePending');
    if (!pending) return {ok: false};
    if (Date.now() - pending.createdAt > MAX_TRANSFER_AGE_MS) { await chrome.storage.session.remove('epsPronotePending'); return {ok: false}; }
    if (!popup(sender) && pending.tabId !== sender.tab.id) return {ok: false};
    if (message.type === 'EPS_PRONOTE_CLEAR_PENDING') {
      if (message.id !== pending.id) return {ok: false};
      await chrome.storage.session.remove('epsPronotePending');
      await chrome.tabs.sendMessage(pending.tabId, {type: 'EPS_PRONOTE_STOP', id: pending.id}).catch(()=>{});
      return {ok: true};
    }
    return {ok: true, id: pending.id, payload: pending.payload, expiresAt: pending.createdAt + MAX_TRANSFER_AGE_MS};
  })().then(sendResponse).catch(e => sendResponse({ok: false, error: e.message}));
  return true;
});
chrome.tabs.onRemoved.addListener(async tabId => {
  const {epsPronotePending: pending} = await chrome.storage.session.get('epsPronotePending');
  if (pending?.tabId === tabId || pending?.sourceTabId === tabId) await chrome.storage.session.remove('epsPronotePending');
});
