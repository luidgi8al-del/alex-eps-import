const PRONOTE_URL = 'https://3500010j.index-education.net/pronote/professeur.html';
const MAX_TRANSFER_AGE_MS = 60 * 60 * 1000;
let opening = false;
let returning = false;
function allowed(url, kind) {
  try {
    const u = new URL(url);
    return kind === 'eps' ? u.origin === 'https://luidgi8al-del.github.io' && u.pathname.startsWith('/alex-eps-import/')
      : u.origin === 'https://3500010j.index-education.net' && u.pathname === '/pronote/professeur.html';
  } catch { return false; }
}
function popup(sender) { return !sender.tab && sender.url === chrome.runtime.getURL('popup.html'); }
function topPage(sender, kind) { return sender.frameId === 0 && sender.tab && allowed(sender.url, kind) && allowed(sender.tab.url, kind); }
const currentPage = (tab, kind) => tab && allowed(tab.url, kind) && (!tab.pendingUrl || allowed(tab.pendingUrl, kind));
const inSplit = tab => Number.isInteger(tab?.splitViewId) && tab.splitViewId >= 0;
const getTab = id => Number.isInteger(id) ? chrome.tabs.get(id).catch(() => null) : Promise.resolve(null);
async function stopPending(pending) {
  // Stop the adapter first, without navigating or closing PRONOTE (a note may be saving).
  await chrome.tabs.sendMessage(pending.tabId, {type: 'EPS_PRONOTE_STOP', id: pending.id}).catch(() => {});
  await chrome.storage.session.remove('epsPronotePending');
}
async function returnToEps(sender, requestedId) {
  if (opening || returning) throw Error('Une opération PRONOTE est déjà en cours. Réessayez Fermer.');
  returning = true;
  try {
    const state = await chrome.storage.session.get(['epsPronotePending', 'epsPronoteView']);
    const pending = state.epsPronotePending;
    let view = state.epsPronoteView || (pending && {id: pending.id, sourceTabId: pending.sourceTabId, tabId: pending.tabId, createdAt: pending.createdAt});
    const fromEps = topPage(sender, 'eps');
    if (fromEps) {
      if ((pending && pending.sourceTabId !== sender.tab.id) || (view && Date.now() - view.createdAt < MAX_TRANSFER_AGE_MS && view.sourceTabId !== sender.tab.id)) return {ok: false, error: 'Ce transfert appartient à un autre onglet EPS.'};
    } else if (!view || requestedId !== view.id || (!popup(sender) && (!topPage(sender, 'pronote') || view.tabId !== sender.tab.id))) {
      return {ok: false, error: 'Transfert non reconnu.'};
    }
    if (pending) await stopPending(pending);
    const source = await getTab(fromEps ? sender.tab.id : view?.sourceTabId);
    if (!currentPage(source, 'eps')) return {ok: false, error: 'Le transfert est arrêté. L’onglet EPS d’origine est fermé ou a changé de page.'};
    if (view && Date.now() - view.createdAt >= MAX_TRANSFER_AGE_MS) {
      await chrome.storage.session.remove('epsPronoteView'); view = null;
    }
    let target = await getTab(view?.tabId);
    // After an extension reload, recognize only the exact visible EPS/PRONOTE pair.
    // Never select one of the user's other PRONOTE tabs or split views by guesswork.
    if (!view && fromEps && inSplit(source)) {
      const pair = await chrome.tabs.query({windowId: source.windowId, splitViewId: source.splitViewId});
      if (pair.length === 2 && pair.some(t => t.id === source.id)) target = pair.find(t => t.id !== source.id && currentPage(t, 'pronote'));
    }
    if (!view && !target) return {ok: true, fullWidth: !inSplit(source), unchanged: true};
    let warning = '';
    if (inSplit(source)) {
      const pair = await chrome.tabs.query({windowId: source.windowId, splitViewId: source.splitViewId});
      const freshSource = pair.find(t => t.id === source.id), freshTarget = pair.find(t => t.id === target?.id);
      const exactPair = currentPage(freshSource, 'eps') && currentPage(freshTarget, 'pronote') && freshSource.windowId === source.windowId && freshTarget.windowId === source.windowId && freshSource.splitViewId === source.splitViewId && freshTarget.splitViewId === source.splitViewId && pair.length === 2;
      if (!exactPair) warning = 'Le transfert est arrêté. La vue partagée actuelle ne correspond plus au transfert ; elle a été conservée.';
      else if (typeof chrome.tabs.unsplit !== 'function') warning = 'Le transfert est arrêté. Pour séparer automatiquement EPS et PRONOTE, mettez Chrome à jour puis redémarrez-le. En attendant : menu de la vue partagée → Séparer les vues.';
      else {
        try { await chrome.tabs.unsplit(source.splitViewId); }
        catch { warning = 'Le transfert est arrêté, mais Chrome n’a pas séparé les vues. Réessayez ou utilisez le menu de la vue partagée → Séparer les vues.'; }
      }
    }
    const latest = await getTab(source.id);
    if (!currentPage(latest, 'eps')) return {ok: false, error: 'Le transfert est arrêté. L’onglet EPS a changé de page.'};
    await chrome.tabs.update(latest.id, {active: true});
    await chrome.windows.update(latest.windowId, {focused: true});
    if (!warning && inSplit(latest)) warning = 'Le transfert est arrêté. Séparez les vues avec le menu de la vue partagée de Chrome.';
    if (warning) await chrome.tabs.sendMessage(latest.id, {type: 'EPS_PRONOTE_RETURN_NOTICE', message: warning}).catch(() => {});
    if (!warning) await chrome.storage.session.remove('epsPronoteView');
    return {ok: true, fullWidth: !inSplit(latest), warning};
  } finally { returning = false; }
}
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
  if (opening || returning) throw Error('Une opération PRONOTE est déjà en cours.');
  const payload = validPayload(raw);
  opening = true;
  try {
    const {epsPronotePending: previous} = await chrome.storage.session.get('epsPronotePending');
    if (previous && Date.now() - previous.createdAt < MAX_TRANSFER_AGE_MS && await chrome.tabs.get(previous.tabId).then(t=>allowed(t.url,'pronote'),()=>false)) throw Error('Un transfert est déjà ouvert. Fermez son panneau PRONOTE avant d’en préparer un autre.');
    const candidates = (await chrome.tabs.query({url: 'https://3500010j.index-education.net/pronote/*'})).filter(t => allowed(t.url, 'pronote'));
    // Reuse only an unambiguous tab; never choose between two logged-in sessions.
    const tab = candidates.length === 1 ? candidates[0] : await chrome.tabs.create({url: PRONOTE_URL, active: true});
    const view = {id: crypto.randomUUID(), createdAt: Date.now(), tabId: tab.id, sourceTabId: sender.tab.id};
    await chrome.storage.session.set({epsPronotePending: {...view, payload}, epsPronoteView: view});
    await chrome.tabs.update(tab.id, {active: true});
    await chrome.windows.update(tab.windowId, {focused: true});
    return {ok: true, protocol: 2, canReturnToEps: true, mode: candidates.length === 1 ? 'existing-tab' : 'new-tab'};
  } finally { opening = false; }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'EPS_PRONOTE_SPLIT') return start(sender, message.payload);
    if (message?.type === 'EPS_PRONOTE_RETURN') {
      if (!topPage(sender, 'eps')) return {ok: false};
      return returnToEps(sender);
    }
    if (!['EPS_PRONOTE_GET_PENDING', 'EPS_PRONOTE_CLEAR_PENDING'].includes(message?.type)) return {ok: false};
    if (!popup(sender) && !topPage(sender, 'pronote')) return {ok: false};
    if (message.type === 'EPS_PRONOTE_CLEAR_PENDING' && message.returnToEps === true) return returnToEps(sender, message.id);
    const {epsPronotePending: pending} = await chrome.storage.session.get('epsPronotePending');
    if (!pending) return {ok: false};
    if (Date.now() - pending.createdAt > MAX_TRANSFER_AGE_MS) { await chrome.storage.session.remove('epsPronotePending'); return {ok: false}; }
    if (!popup(sender) && pending.tabId !== sender.tab.id) return {ok: false};
    if (message.type === 'EPS_PRONOTE_CLEAR_PENDING') {
      if (message.id !== pending.id) return {ok: false};
      await stopPending(pending);
      return {ok: true};
    }
    return {ok: true, id: pending.id, payload: pending.payload, expiresAt: pending.createdAt + MAX_TRANSFER_AGE_MS};
  })().then(sendResponse).catch(e => sendResponse({ok: false, error: e.message}));
  return true;
});
chrome.tabs.onRemoved.addListener(async tabId => {
  const {epsPronotePending: pending, epsPronoteView: view} = await chrome.storage.session.get(['epsPronotePending', 'epsPronoteView']);
  if (pending?.tabId === tabId || pending?.sourceTabId === tabId) await chrome.storage.session.remove('epsPronotePending');
  if (view?.tabId === tabId || view?.sourceTabId === tabId) await chrome.storage.session.remove('epsPronoteView');
});
