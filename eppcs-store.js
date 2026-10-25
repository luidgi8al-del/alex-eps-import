/* Private EPPCS library. No course content is shipped by this module. */
(function (root) {
  'use strict';
  const PREFIX = 'eps-eppcs-v1-', REGISTRY = 'eps:eppcs-databases';
  const LIBRARY_LIMIT = 4 * 1024 * 1024, NOTE_LIMIT = 64 * 1024, MAX_RECORDS = 501;
  const clients = new Set();
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  // PostgreSQL jsonb reorders object keys. Equality must ignore that harmless change.
  const equal = (a, b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.prototype.hasOwnProperty.call(b, k) && equal(a[k], b[k]));
  };
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
  const error = (message, name = 'Error') => Object.assign(new Error(message), {name});
  function validKey(key) { return key === 'library' || /^note:[a-zA-Z0-9._-]{1,100}$/.test(key); }
  function validatePayload(key, payload) {
    if (!validKey(key) || !object(payload)) throw error('Contenu EPPCS invalide.');
    if (key !== 'library') {
      if (typeof payload.text !== 'string' || Object.keys(payload).some(k => !['text', 'status', 'savedAt'].includes(k)))
        throw error('Note de séance invalide.');
      if (payload.status !== undefined && !['preparer', 'enseigne'].includes(payload.status)) throw error('Avancement de séance invalide.');
      if (payload.savedAt !== undefined && (typeof payload.savedAt !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(payload.savedAt) || !Number.isFinite(Date.parse(payload.savedAt))))
        throw error('Date de préparation invalide.');
    }
    if (bytes(payload) > (key === 'library' ? LIBRARY_LIMIT : NOTE_LIMIT)) throw error('Ce contenu EPPCS est trop volumineux.');
    return copy(payload);
  }
  function rememberDatabase(name) {
    try { const names = JSON.parse(localStorage.getItem(REGISTRY) || '[]'); if (!names.includes(name)) localStorage.setItem(REGISTRY, JSON.stringify([...names, name])); } catch { /* Enumeration remains available on current browsers. */ }
  }
  function openDatabase(name) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('records', {keyPath: 'key'});
      req.onsuccess = () => { const db = req.result; db.onversionchange = () => db.close(); rememberDatabase(name); resolve(db); };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(error('Fermez les autres onglets EPPCS puis réessayez.'));
    });
  }
  function readRows(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly'), req = tx.objectStore('records').getAll();
      tx.oncomplete = () => resolve(req.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || error('Lecture annulée.'));
    });
  }
  async function databaseNames() {
    let registered = []; try { registered = JSON.parse(localStorage.getItem(REGISTRY) || '[]'); } catch {}
    const found = await indexedDB.databases?.().catch(() => []) || [];
    return [...new Set([...registered, ...found.map(v => v.name)])].filter(n => typeof n === 'string' && n.startsWith(PREFIX));
  }
  async function hasPendingAllLocal() {
    for (const name of await databaseNames()) {
      const db = await openDatabase(name);
      try { if ((await readRows(db)).some(r => r.pending || r.conflict)) return true; } finally { db.close(); }
    }
    return false;
  }
  async function eraseAllLocal() {
    if (await hasPendingAllLocal()) throw error('Effacement annulé : des cours ou notes EPPCS attendent leur synchronisation. Exportez une sauvegarde et terminez les envois.');
    for (const client of [...clients]) client.destroy();
    for (const name of await databaseNames()) {
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = resolve; req.onerror = () => reject(req.error);
        req.onblocked = () => reject(error('Un autre onglet conserve la copie EPPCS ouverte. Fermez-le avant d’effacer cet appareil.'));
      });
    }
    try { localStorage.removeItem(REGISTRY); } catch {}
  }
  function create({userId, getSession, baseUrl, anonKey, refreshSession, onChange, fetch: send = root.fetch?.bind(root)} = {}) {
    if (!userId || typeof getSession !== 'function') throw error('Connectez-vous pour ouvrir vos cours EPPCS.');
    const name = PREFIX + encodeURIComponent(userId);
    let closed = false, opening, lastStatus = {kind: 'local', message: 'Copie EPPCS de cet appareil.', pending: 0};
    let syncing = null, again = false;
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('eps-eppcs-updates') : null;
    const owner = () => getSession()?.user_id || getSession()?.user?.id;
    function assertOwner() { if (closed || owner() !== userId) throw error('Le compte a changé. Vos cours restent dans leur compte d’origine.', 'AccountChangedError'); }
    async function database() { assertOwner(); opening ||= openDatabase(name).catch(e => { opening = null; throw e; }); const db = await opening; assertOwner(); return db; }
    async function rows() { const result = await readRows(await database()); assertOwner(); return result; }
    async function mutate(key, action, {requireEmpty = false} = {}) {
      const db = await database(); assertOwner();
      return new Promise((resolve, reject) => {
        let result, failure;
        const tx = db.transaction('records', 'readwrite', {durability: 'strict'}), store = tx.objectStore('records');
        const req = store.get(key);
        req.onsuccess = () => {
          try {
            assertOwner();
            if (requireEmpty && req.result) throw error('Cet atelier contient déjà du travail. Aucun cours n’a été remplacé.');
            result = action(copy(req.result));
            if (result && !req.result) {
              const count = store.count();
              count.onsuccess = () => {
                try {
                  assertOwner();
                  if (requireEmpty && count.result) throw error('Cet atelier contient déjà du travail. Aucun cours n’a été remplacé.');
                  if (count.result >= MAX_RECORDS) throw error('Limite de notes EPPCS atteinte.'); store.put(result);
                }
                catch (e) { failure = e; tx.abort(); }
              };
            } else if (result) store.put(result);
          }
          catch (e) { failure = e; tx.abort(); }
        };
        tx.oncomplete = () => { try { assertOwner(); resolve(copy(result)); } catch (e) { reject(e); } };
        tx.onabort = tx.onerror = () => reject(failure || tx.error || error('L’enregistrement local a été interrompu.'));
      });
    }
    async function load() {
      const all = await rows(), notes = {}, conflicts = [];
      for (const row of all) {
        if (row.key.startsWith('note:')) notes[row.key.slice(5)] = {text: row.payload.text,
          status: row.payload.status || 'preparer', savedAt: row.payload.savedAt || null, base: row.seq};
        if (row.conflict) conflicts.push({key: row.key, ...copy(row.conflict)});
      }
      const pending = all.filter(r => r.pending).length;
      let status = {...lastStatus, pending};
      if (conflicts.length) status = {kind: 'conflict', pending, message: 'Deux versions sont conservées. Choisissez celle à garder pour chaque conflit.'};
      else if (pending && status.kind === 'synced') status = {kind: 'pending', pending, message: 'Enregistré sur cet appareil — envoi en attente.'};
      return {library: copy(all.find(r => r.key === 'library')?.payload || null), notes, conflicts, status};
    }
    async function publish(broadcast = true) {
      assertOwner(); const state = await load();
      if (broadcast) channel?.postMessage({owner: userId});
      if (!closed) onChange?.(state);
      return state;
    }
    if (channel) channel.onmessage = event => { if (event.data?.owner === userId && !closed && owner() === userId) publish(false).catch(() => {}); };
    function startSync() { if (!closed && owner() === userId) sync().catch(() => {}); }
    async function saveNote(courseId, note) {
      const key = 'note:' + courseId, payload = validatePayload(key, {text: note?.text,
        status: note?.status ?? 'preparer', savedAt: note?.savedAt ?? new Date().toISOString()});
      if (!Object.prototype.hasOwnProperty.call(note || {}, 'base')) throw error('Rouvrez cette note avant de la modifier.');
      await mutate(key, current => {
        if (current && equal(current.payload, payload)) return current;
        if ((current?.seq ?? null) !== note.base) {
          if (current?.conflict) throw error('Un conflit est déjà conservé pour cette note. Réglez-le avant une nouvelle modification.');
          return {payload: {text: ''}, revision: 0, confirmed: null, pending: false, ...current, key,
            conflict: {kind: 'local', local: payload, remote: copy(current?.payload || {text: ''}), remoteRevision: current?.revision || 0}, seq: (current?.seq || 0) + 1};
        }
        if (current?.conflict) throw error('Choisissez d’abord la version de cette note à conserver.');
        return {...current, key, payload, seq: (current?.seq || 0) + 1, revision: current?.revision || 0,
          confirmed: current?.confirmed || null, pending: true};
      });
      lastStatus = {kind: 'pending', message: 'Note enregistrée sur cet appareil — envoi en attente.'};
      const state = await publish(); startSync(); return state;
    }
    async function importLibrary(library, {requireEmpty = false} = {}) {
      const payload = validatePayload('library', library);
      await mutate('library', current => {
        if (current?.conflict) throw error('Choisissez d’abord la bibliothèque à conserver.');
        if (current && equal(current.payload, payload)) return current;
        return {...current, key: 'library', payload, seq: (current?.seq || 0) + 1, revision: current?.revision || 0,
          confirmed: current?.confirmed || null, pending: true};
      }, {requireEmpty});
      lastStatus = {kind: 'pending', message: 'Cours importés sur cet appareil — envoi en attente.'};
      const state = await publish(); startSync(); return state;
    }
    async function request(path, options = {}, retried = false) {
      assertOwner(); const token = getSession()?.access_token;
      if (!token) throw error('Reconnectez votre compte pour synchroniser. Vos cours restent sur cet appareil.');
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
      let response;
      try {
        response = await send(baseUrl.replace(/\/$/, '') + path, {...options, signal: controller.signal,
          headers: {apikey: anonKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}});
      } finally { clearTimeout(timeout); }
      assertOwner();
      if (response.status === 401 && !retried && refreshSession) {
        const renewed = await refreshSession(); assertOwner();
        if (renewed) return request(path, options, true);
      }
      let data; try { data = await response.json(); } catch { data = null; }
      assertOwner();
      if (!response.ok) {
        if (response.status === 404 || ['PGRST202', 'PGRST205', '42P01'].includes(data?.code))
          throw error('Enregistré sur cet appareil — la synchronisation EPPCS doit encore être activée dans Supabase.', 'SchemaUnavailableError');
        if ([401,403].includes(response.status)) throw error('Synchronisation non autorisée pour ce compte. Vos cours restent conservés sur cet appareil.');
        throw error('Envoi EPPCS non confirmé. Vos cours et notes restent conservés sur cet appareil.');
      }
      return data;
    }
    function remoteRow(raw) {
      if (!raw || raw.user_id !== userId || !Number.isSafeInteger(raw.revision) || raw.revision < 1) throw error('Réponse EPPCS invalide. La copie locale est conservée.');
      return {...raw, payload: validatePayload(raw.document_id, raw.payload)};
    }
    async function pull() {
      const result = [];
      for (let offset = 0; ; offset += 100) {
        const data = await request('/rest/v1/eps_eppcs_documents?user_id=eq.' + encodeURIComponent(userId) + '&select=user_id,document_id,payload,revision&order=document_id&limit=100&offset=' + offset);
        if (!Array.isArray(data)) throw error('Réponse EPPCS invalide.');
        result.push(...data.map(remoteRow));
        if (result.length > MAX_RECORDS) throw error('Trop de documents EPPCS dans ce compte.');
        if (data.length < 100) return result;
      }
    }
    async function reconcile(remote) {
      await mutate(remote.document_id, current => {
        if (current?.conflict) return current;
        if (!current) return {key: remote.document_id, payload: remote.payload, seq: 1, revision: remote.revision, confirmed: remote.payload, pending: false};
        if (remote.revision < current.revision) return current;
        if (current.pending) {
          if (equal(current.payload, remote.payload)) return {...current, revision: remote.revision, confirmed: remote.payload, pending: false};
          if (remote.revision !== current.revision) {
            if (equal(current.confirmed, remote.payload)) return {...current, revision: remote.revision};
            return {...current, conflict: {kind: 'cloud', local: current.payload, remote: remote.payload, remoteRevision: remote.revision}};
          }
          return current;
        }
        if (remote.revision === current.revision) return current;
        return {...current, payload: remote.payload, seq: current.seq + 1, revision: remote.revision, confirmed: remote.payload, pending: false};
      });
    }
    async function runSync() {
      try {
        assertOwner();
        if (!baseUrl || !anonKey || typeof send !== 'function' || root.navigator?.onLine === false) {
          lastStatus = {kind: 'local', message: 'Enregistré sur cet appareil — synchronisation à la prochaine connexion.'};
          return publish();
        }
        for (let round = 0; round < 3; round++) {
          again = false;
          const remote = await pull();
          for (const row of remote) await reconcile(row);
          for (const sent of await rows()) {
            if (!sent.pending || sent.conflict) continue;
            const result = await request('/rest/v1/rpc/eps_save_eppcs_document', {method: 'POST', body: JSON.stringify({p_document_id: sent.key, p_expected: sent.revision, p_payload: sent.payload})});
            if (!result?.saved) {
              // Preserve both exact versions returned atomically by the CAS RPC.
              if (!result?.current) throw error('La version serveur ne peut pas être vérifiée. Votre copie est conservée.');
              const other = remoteRow(result.current);
              await reconcile(other); continue;
            }
            if (!Number.isSafeInteger(result.revision) || result.revision <= sent.revision) throw error('Confirmation EPPCS invalide. Votre copie reste en attente.');
            await mutate(sent.key, current => {
              if (!current) return null;
              // An ACK acknowledges only the payload sent, never a later local edit.
              if (current.revision > result.revision) return current;
              return {...current, revision: result.revision, confirmed: sent.payload,
                pending: current.seq !== sent.seq || !equal(current.payload, sent.payload) || !!current.conflict};
            });
          }
          if (!again) break;
        }
        const pending = (await rows()).some(r => r.pending);
        lastStatus = pending ? {kind: 'pending', message: 'Enregistré sur cet appareil — certaines modifications attendent encore leur envoi.'}
          : {kind: 'synced', message: 'Cours et notes synchronisés avec votre compte.'};
        return publish();
      } catch (e) {
        if (e.name === 'AccountChangedError') throw e;
        lastStatus = {kind: e.name === 'SchemaUnavailableError' ? 'unavailable' : 'error', message: ['TypeError', 'AbortError'].includes(e.name)
          ? 'Réseau indisponible. Les cours et notes enregistrés restent sur cet appareil.' : e.message};
        return publish();
      }
    }
    function sync() {
      assertOwner(); if (syncing) { again = true; return syncing; }
      syncing = runSync().finally(() => { syncing = null; }); return syncing;
    }
    async function resolveConflict(key, choice) {
      if (!['local', 'remote'].includes(choice)) throw error('Choisissez une des deux versions.');
      await mutate(key, current => {
        if (!current?.conflict) throw error('Ce conflit a déjà été traité. Rouvrez la fiche.');
        const conflict = current.conflict, payload = copy(conflict[choice]);
        const cloud = conflict.kind === 'cloud';
        return {...current, payload, seq: current.seq + 1, revision: cloud ? conflict.remoteRevision : current.revision,
          confirmed: cloud ? conflict.remote : current.confirmed, pending: cloud ? choice === 'local' : true, conflict: null};
      });
      lastStatus = {kind: 'pending', message: 'Version choisie enregistrée sur cet appareil.'};
      const state = await publish(); startSync(); return state;
    }
    async function exportBackup() {
      const data = await rows();
      return JSON.stringify({format: 'eps-eppcs-backup', version: 1, owner: userId, exportedAt: new Date().toISOString(),
        records: data.map(({key,payload,conflict}) => ({key,payload,...(conflict ? {conflict} : {})}))}, null, 2);
    }
    async function importBackup(json) {
      if (typeof json !== 'string' || new TextEncoder().encode(json).length > 128 * 1024 * 1024) throw error('Sauvegarde EPPCS trop volumineuse.');
      const backup = JSON.parse(json);
      if (backup.format !== 'eps-eppcs-backup' || backup.version !== 1 || backup.owner !== userId || !Array.isArray(backup.records) || backup.records.length > MAX_RECORDS)
        throw error('Sauvegarde incompatible ou appartenant à un autre compte.');
      const seen = new Set();
      for (const row of backup.records) {
        if (seen.has(row.key)) throw error('Document dupliqué dans la sauvegarde.'); seen.add(row.key);
        validatePayload(row.key, row.payload);
        if (row.conflict) { validatePayload(row.key, row.conflict.local); validatePayload(row.key, row.conflict.remote); }
      }
      const db = await database(); assertOwner();
      await new Promise((resolve, reject) => {
        let failure;
        const tx = db.transaction('records', 'readwrite', {durability: 'strict'}), store = tx.objectStore('records'), req = store.count();
        req.onsuccess = () => {
          try {
            assertOwner(); if (req.result) throw error('Restaurez cette sauvegarde dans un atelier vide afin de préserver vos travaux actuels.');
            for (const row of backup.records) store.put({key: row.key, payload: copy(row.payload), seq: 1, revision: 0, confirmed: null, pending: true,
              conflict: row.conflict ? {...copy(row.conflict), kind: 'local', remoteRevision: 0} : null});
          } catch (e) { failure = e; tx.abort(); }
        };
        tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(failure || tx.error || error('Restauration non enregistrée.'));
      });
      lastStatus = {kind: 'pending', message: 'Sauvegarde restaurée sur cet appareil. Les versions serveur seront vérifiées avant envoi.'};
      const state = await publish(); startSync(); return state;
    }
    const api = {load, importLibrary, saveNote, sync, resolveConflict, exportBackup, importBackup,
      destroy() { closed = true; channel?.close(); opening?.then(db => db.close()).catch(() => {}); clients.delete(api); }};
    clients.add(api); return api;
  }
  root.EPPCSStore = Object.freeze({create, eraseAllLocal, hasPendingAllLocal, validatePayload});
})(globalThis);
