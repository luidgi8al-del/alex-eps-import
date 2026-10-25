/* Account-owned EPPCS workspace; teaching documents are imported privately, never bundled. */
(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let root, store, view, owner, generation = 0, snapshot, mountedLibrary = '', opening;
  const currentSession = () => typeof session === 'undefined' ? null : session;
  const id = () => currentSession()?.user_id;
  function validateLibrary(data) {
    const fail = () => { throw Error('Ce fichier ne contient pas une bibliothèque EPPCS compatible. Aucun cours n’a été remplacé.'); };
    const array = (value, max) => Array.isArray(value) && value.length <= max;
    const plain = value => value && typeof value === 'object' && !Array.isArray(value);
    const text = value => typeof value === 'string';
    const key = value => text(value) && /^[a-zA-Z0-9._-]{1,100}$/.test(value);
    let nodes = 0;
    function walk(value, depth = 0) {
      if (++nodes > 300000 || depth > 30) fail();
      if (value && typeof value === 'object') for (const name of Object.keys(value)) {
        if (['__proto__','constructor','prototype'].includes(name)) fail();
        walk(value[name], depth + 1);
      }
    }
    function blocks(values) {
      if (!array(values, 10000)) fail();
      for (const block of values) {
        if (!plain(block)) fail();
        if (block.type === 'table') {
          if (!array(block.rows, 1000) || block.rows.some(row => !array(row, 100) || row.some(cell => !text(cell)))) fail();
        } else if (block.type !== 'paragraph' || !text(block.text)) fail();
        if (block.runs !== undefined && (!array(block.runs, 10000) || block.runs.some(run => !plain(run) || !text(run.text)))) fail();
      }
    }
    if (!plain(data) || !array(data.courses, 200) || !data.courses.length || !array(data.controls, 200) || !array(data.sources, 100)) fail();
    walk(data);
    const courseIds = new Set(), courseNumbers = new Set();
    for (const course of data.courses) {
      if (!plain(course) || !key(course.id) || courseIds.has(course.id) || !text(course.title) || !Number.isInteger(course.number) || courseNumbers.has(course.number)) fail();
      courseIds.add(course.id); courseNumbers.add(course.number);
      if (!array(course.sections, 100) || !array(course.sessions, 100) || !array(course.quizzes, 500)) fail();
      const sections = new Set();
      for (const section of course.sections) {
        if (!plain(section) || !key(section.id) || sections.has(section.id) || !text(section.title) || !text(section.kind)) fail();
        sections.add(section.id); blocks(section.blocks);
      }
      if (course.sessions.some(s => !plain(s) || !text(s.title) || !text(s.description))) fail();
      const questions = new Set();
      for (const q of course.quizzes) {
        if (!plain(q) || !Number.isInteger(q.number) || questions.has(q.number) || !text(q.prompt) || !array(q.choices, 30) || q.choices.some(c => !plain(c) || !text(c.key) || !text(c.text))) fail();
        questions.add(q.number);
      }
    }
    const controls = new Set();
    for (const control of data.controls) {
      if (!plain(control) || !key(control.id) || controls.has(control.id) || !text(control.title) || !array(control.courseNumbers, 200) || control.courseNumbers.some(n => !courseNumbers.has(n))) fail();
      controls.add(control.id); blocks(control.subject); blocks(control.correction);
    }
    return data;
  }
  function reset() {
    generation++; view?.destroy(); view = null; store?.destroy(); store = null;
    owner = null; snapshot = null; opening = null; mountedLibrary = '';
    if (root) { root.replaceChildren(); root = null; }
  }
  function ensureStore() {
    const userId = id();
    if (!userId) throw Error('Connecte-toi pour ouvrir ton atelier privé.');
    if (store && owner !== userId) reset();
    if (!store) {
      owner = userId; const epoch = generation;
      store = EPPCSStore.create({userId, getSession: currentSession, baseUrl: SUPABASE_URL, anonKey: SUPABASE_KEY,
        refreshSession: () => renouvelerSession(),
        onChange: state => { if (generation === epoch && id() === userId) {
          snapshot = state; updateStatus(); mountLibrary();
          if (view?.refreshNotes(state.notes)) showError(Error('Une note a été modifiée ailleurs. Ton brouillon est conservé ; les deux versions seront comparées lors de son enregistrement.'));
        } }
      });
    }
    return store;
  }
  function showError(error) {
    if (!root) return;
    const node = root.querySelector('[data-eppcs-message]');
    if (node) node.textContent = error?.message || 'Action interrompue. Tes données enregistrées restent conservées.';
  }
  function shell() {
    root.classList.add('ep-account');
    root.innerHTML = '<div class="ep-account-bar"><p data-eppcs-status role="status">Ouverture de ton atelier privé…</p><details class="ep-account-manage"><summary>Gérer l’atelier</summary><div class="ep-account-actions"><button type="button" data-eppcs-action="sync">Synchroniser</button><button type="button" data-eppcs-action="backup">Sauvegarder l’atelier</button><button type="button" data-eppcs-action="reload">Recharger les versions enregistrées</button></div></details></div><p class="ep-account-message" data-eppcs-message role="status"></p><div data-eppcs-conflicts></div><div data-eppcs-content></div>';
    root.onclick = event => {
      const action = event.target.closest('[data-eppcs-action]');
      if (action) handle(action.dataset.eppcsAction, action).catch(showError);
    };
    root.onchange = event => {
      if (event.target.matches('[data-eppcs-file]')) importFile(event.target.files?.[0]).catch(showError).finally(() => { event.target.value = ''; });
    };
  }
  function updateStatus() {
    if (!root || !snapshot) return;
    const node = root.querySelector('[data-eppcs-status]');
    if (node) { node.textContent = snapshot.status.message; node.dataset.state = snapshot.status.kind; }
    const conflicts = root.querySelector('[data-eppcs-conflicts]');
    if (!conflicts) return;
    conflicts.innerHTML = (snapshot.conflicts || []).map(c => {
      const summary = value => c.key === 'library' ? ((value?.courses?.length || 0) + ' chapitres dans cette version') : String(value?.text || '(note vide)');
      const remote = c.kind === 'local' ? 'Version déjà enregistrée sur cet appareil' : 'Version du compte en ligne';
      return '<section class="ep-account-conflict"><h3>Deux versions conservées · ' + escape(c.key === 'library' ? 'Bibliothèque' : c.key.replace('note:', '')) + '</h3><p>Exporte une sauvegarde pour conserver les deux versions avant de choisir.</p><div class="ep-conflict-grid"><div><h4>Ma modification</h4><pre>' + escape(summary(c.local)) + '</pre><button type="button" data-eppcs-action="resolve-local" data-key="' + escape(c.key) + '">Garder ma modification</button></div><div><h4>' + remote + '</h4><pre>' + escape(summary(c.remote)) + '</pre><button type="button" data-eppcs-action="resolve-remote" data-key="' + escape(c.key) + '">Garder cette version</button></div></div></section>';
    }).join('');
  }
  function mountLibrary(force = false) {
    if (!root || !snapshot) return;
    const target = root.querySelector('[data-eppcs-content]');
    if (!snapshot.library) {
      if (view) return;
      if (target.querySelector('[data-eppcs-file]')) return;
      target.innerHTML = '<section class="ep-account-empty"><h2>Atelier EPPCS</h2><p>Retrouve ici tes cours de Première, séances, quiz et contrôles, dans une bibliothèque privée liée à ton compte.</p><h3>Importer mes documents préparés</h3><p>Choisis le fichier <strong>Atelier-EPPCS-Premiere.eppcs.json</strong> préparé à partir de tes trois documents Word, ou une sauvegarde EPPCS de ce compte.</p><label class="ep-file-label">Choisir le fichier EPPCS<input type="file" data-eppcs-file accept=".json,application/json"></label><p>Les cours seront conservés sur cet appareil et envoyés dans ton espace privé si la synchronisation EPPCS a été activée. Ils ne seront pas publiés sur le site.</p><p>Hors connexion : ouvre et importe une première fois l’atelier avec Internet avant de l’utiliser sans réseau. Les liens vers les sources externes demandent Internet.</p></section>';
      return;
    }
    const fingerprint = JSON.stringify(snapshot.library);
    if (view && !force) {
      if (fingerprint !== mountedLibrary) showError(Error('Une autre version de la bibliothèque est disponible. Enregistre tes notes puis utilise « Recharger les versions enregistrées ».'));
      return;
    }
    validateLibrary(snapshot.library);
    view?.destroy(); mountedLibrary = fingerprint;
    const boundStore = store, epoch = generation;
    view = EPPCSView.mount(target, {data: snapshot.library,
      loadNotes: async () => (await boundStore.load()).notes,
      saveNote: async (courseId, note) => {
        if (generation !== epoch || owner !== id()) throw Error('Le compte a changé.');
        const state = await boundStore.saveNote(courseId, note);
        if (state.conflicts.some(c => c.key === 'note:' + courseId)) throw Error('Deux versions ont été conservées. Choisis celle à garder dans le panneau au-dessus.');
        return {...state.notes[courseId], message: state.status.message};
      }, onError: showError
    });
  }
  function safeReload() {
    if (view?.hasUnsavedDraft()) throw Error('Enregistre d’abord tes notes de préparation. Le brouillon reste dans l’atelier.');
  }
  async function open(target) {
    if (opening) return opening;
    if (root === target && view && owner === id()) { sync().catch(showError); return; }
    const activeStore = ensureStore(), epoch = generation;
    root = target; shell();
    opening = (async () => {
      try {
        snapshot = await activeStore.load(); if (generation !== epoch) return;
        updateStatus(); mountLibrary();
        await activeStore.sync();
      } catch (e) { if (generation === epoch) showError(e); }
      finally { if (generation === epoch) opening = null; }
    })();
    return opening;
  }
  async function sync() { return ensureStore().sync(); }
  function download(json) {
    const blob = new Blob([json], {type:'application/json;charset=utf-8'}), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'EPPCS-sauvegarde-' + new Date().toISOString().slice(0,10) + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function importFile(file) {
    if (!file) return;
    if (file.size > 128 * 1024 * 1024) throw Error('Fichier trop volumineux. Utilise le fichier EPPCS préparé ou sa sauvegarde.');
    safeReload(); const activeStore = ensureStore(), epoch = generation;
    const json = await file.text(); if (generation !== epoch) return;
    let data; try { data = JSON.parse(json); } catch { throw Error('Ce fichier n’est pas un fichier EPPCS JSON valide.'); }
    const existing = await activeStore.load();
    if (existing.library || Object.keys(existing.notes).length) throw Error('Cet atelier contient déjà du travail. L’import est réservé à un atelier vide pour ne rien remplacer.');
    if (data?.format === 'eps-eppcs-backup') {
      for (const record of data.records || []) if (record.key === 'library') {
        validateLibrary(record.payload);
        if (record.conflict) { validateLibrary(record.conflict.local); validateLibrary(record.conflict.remote); }
      }
      snapshot = await activeStore.importBackup(json);
    } else {
      if (data?.format !== 'eps-eppcs-library' || data.version !== 1) throw Error('Choisis le fichier Atelier-EPPCS-Premiere.eppcs.json préparé pour cet atelier.');
      snapshot = await activeStore.importLibrary(validateLibrary(data.library), {requireEmpty:true});
    }
    if (generation === epoch) { updateStatus(); mountLibrary(); }
  }
  async function handle(action, button) {
    const activeStore = ensureStore(), epoch = generation;
    if (action === 'sync') { button.disabled = true; try { await sync(); } finally { button.disabled = false; } }
    else if (action === 'backup') {
      const json = await activeStore.exportBackup(); if (epoch !== generation) return;
      download(json); showError(Error(view?.hasUnsavedDraft() ? 'Sauvegarde téléchargée. Attention : les notes encore non enregistrées ne sont pas incluses.' : 'Sauvegarde EPPCS téléchargée. Conserve ce fichier dans un endroit privé.'));
    } else if (action === 'reload') {
      safeReload(); snapshot = await activeStore.load(); if (epoch !== generation) return;
      safeReload();
      updateStatus(); mountLibrary(true);
    } else if (action.startsWith('resolve-')) {
      // A rejected stale save is already retained as the local conflict version.
      // Only such exact drafts may be discarded when explicitly resolving it.
      const startingDrafts = JSON.stringify(view?.getDrafts() || {});
      const current = await activeStore.load();
      if (startingDrafts !== JSON.stringify(view?.getDrafts() || {})) throw Error('Une note vient de changer. Elle est conservée : termine-la avant de choisir une version.');
      for (const [courseId, draft] of Object.entries(view?.getDrafts() || {})) {
        const savedConflict = current.conflicts.find(c => c.key === 'note:' + courseId);
        if (!savedConflict || savedConflict.local?.text !== draft.text || (savedConflict.local?.status || 'preparer') !== draft.status)
          throw Error('Enregistre les autres brouillons avant de choisir une version. Aucun brouillon n’a été effacé.');
      }
      if (!confirm('Conserver cette version ? L’autre ne sera plus proposée dans l’atelier. Télécharge une sauvegarde avant de poursuivre si tu veux garder les deux.')) return;
      const conflict = (await activeStore.load()).conflicts.find(c => c.key === button.dataset.key);
      if (conflict?.key === 'library') validateLibrary(conflict[action === 'resolve-local' ? 'local' : 'remote']);
      snapshot = await activeStore.resolveConflict(button.dataset.key, action === 'resolve-local' ? 'local' : 'remote');
      if (epoch !== generation) return;
      updateStatus();
      if (startingDrafts !== JSON.stringify(view?.getDrafts() || {})) {
        showError(Error('La version choisie est enregistrée. Le nouveau brouillon reste dans cet écran : enregistre-le avant de recharger.'));
        return;
      }
      mountLibrary(true);
    }
  }
  window.addEventListener('beforeunload', event => { if (view?.hasUnsavedDraft()) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('online', () => { if (store && owner === id()) sync().catch(showError); });
  window.addEventListener('storage', event => {
    if (event.key !== 'alex_eps_session') return;
    let other; try { other = JSON.parse(event.newValue); } catch {}
    if (owner && other?.user_id !== owner) { reset(); window.showAuthView?.(); }
  });
  window.EPSAtelierEPPCS = Object.freeze({open, reset, sync, getState: async () => ensureStore().load(),
    hasUnsavedDraft: () => !!view?.hasUnsavedDraft(), validateLibrary});
})();
