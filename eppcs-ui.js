/* EPPCS reader. Teaching content is supplied by the account's private library. */
(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normal = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const list = value => Array.isArray(value) ? value : [];
  function inline(block) {
    if (!list(block.runs).length) return escape(block.text);
    return block.runs.map(run => {
      let text = escape(run.text);
      if (run.bold) text = '<strong>' + text + '</strong>';
      if (run.italic) text = '<em>' + text + '</em>';
      if (typeof run.href === 'string' && /^https?:\/\//i.test(run.href)) text = '<a href="' + escape(run.href) + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
      return text;
    }).join('');
  }
  function blocks(items) {
    let html = '', inList = false;
    for (const block of list(items)) {
      const bullet = block.type !== 'table' && /List Bullet/.test(block.style || '');
      if (!bullet && inList) { html += '</ul>'; inList = false; }
      if (block.type === 'table') {
        const rows = list(block.rows);
        html += '<div class="ep-table"><table><thead><tr>' + list(rows[0]).map(cell => '<th scope="col">' + escape(cell) + '</th>').join('') + '</tr></thead><tbody>' + rows.slice(1).map(row => '<tr>' + list(row).map(cell => '<td>' + escape(cell).replace(/\n/g, '<br>') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
      } else if (String(block.text || '').trim()) {
        if (bullet) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(block) + '</li>'; }
        else if (/^Heading/.test(block.style || '')) html += '<h3>' + inline(block) + '</h3>';
        else html += '<p' + (block.style === 'Caption' ? ' class="ep-muted"' : '') + '>' + inline(block) + '</p>';
      }
    }
    return html + (inList ? '</ul>' : '');
  }
  function sourceLabel(source) {
    if (!source) return '';
    return [source.file, source.paragraph ? 'paragraphe ' + source.paragraph : source.table ? 'tableau ' + source.table : ''].filter(Boolean).join(' · ');
  }
  let nextMount = 0;
  function mount(root, options = {}) {
    if (!root || !options.data || !list(options.data.courses).length) throw new Error('La bibliothèque EPPCS est vide ou indisponible.');
    const data = options.data, uid = 'ep-' + (++nextMount) + '-', courses = data.courses;
    const state = { courseId: null, tab: 'course', mode: 'library', section: '', session: 0, filter: '', large: false, reveal: false, answers: {}, controlId: null, correction: false };
    const notes = Object.create(null), drafts = Object.create(null), saving = new Set(), statuses = Object.create(null);
    let destroyed = false, loadError = '', notesLoading = true, printFrame = null;
    root.classList.add('eppcs-view');
    const chapter = () => courses.find(c => String(c.id) === state.courseId);
    const sections = (c, kinds) => list(c.sections).filter(s => kinds.includes(s.kind));
    const reader = content => '<div class="ep-reader' + (state.large ? ' ep-large' : '') + '">' + blocks(content) + '</div>';
    const button = (label, action, extra = '') => '<button type="button" data-ep-action="' + action + '" ' + extra + '>' + label + '</button>';
    const footer = text => '<p class="ep-source">' + escape(text) + ' · Contenu importé sans réécriture. La pagination écran diffère du document Word.</p>';
    function noteFor(id) { return drafts[id] || notes[id] || { text: '', status: 'preparer' }; }
    function report(error) { if (typeof options.onError === 'function') options.onError(error); }
    function announce(text) { const node = root.querySelector('[data-ep-notice]'); if (node) node.textContent = text; }
    function groups() {
      const map = new Map();
      for (const c of courses) { const key = c.theme || 'Chapitres'; if (!map.has(key)) map.set(key, []); map.get(key).push(c); }
      return [...map.entries()];
    }
    const matches = c => normal([c.title, c.theme, c.number, c.question].join(' ')).includes(normal(state.filter));
    function renderHome() {
      return '<div class="ep-intro"><div class="ep-eyebrow">Atelier EPPCS · Bibliothèque privée</div><h2>' + escape(data.level || 'Première EPPCS') + '</h2><p>Préparer un chapitre, retrouver ses documents et suivre le déroulement de la séance.</p><div class="ep-counts"><span><strong>' + courses.length + '</strong> chapitres</span><span><strong>' + courses.filter(c => list(c.quizzes).length).length + '</strong> quiz</span><span><strong>' + list(data.controls).length + '</strong> contrôles</span></div></div><label class="ep-label" for="' + uid + 'search">Rechercher un chapitre</label><input id="' + uid + 'search" type="search" data-ep-search placeholder="Titre ou thème…" value="' + escape(state.filter) + '"><div data-ep-groups>' + renderGroups() + '</div>';
    }
    function renderGroups() {
      return groups().map(([theme, values]) => {
        const found = values.filter(matches); if (!found.length) return '';
        return '<section class="ep-theme"><h3>' + escape(theme) + '</h3><div class="ep-cards">' + found.map(c => '<button type="button" class="ep-chapter" data-ep-course="' + escape(c.id) + '"><span class="ep-number">' + escape(String(c.number).padStart(2, '0')) + '</span><span><strong>' + escape(c.title) + '</strong><small>' + list(c.sessions).length + ' séance(s) indiquée(s) dans le document</small></span><span aria-hidden="true">›</span></button>').join('') + '</div></section>';
      }).join('') || '<p class="ep-empty">Aucun chapitre ne correspond à cette recherche.</p>';
    }
    function panelHeader(title, printAction) {
      return '<div class="ep-panel-head"><h3>' + escape(title) + '</h3><div class="ep-tools">' + button('A+', 'font', 'aria-label="Agrandir le texte" aria-pressed="' + state.large + '"') + (printAction ? button('Imprimer / PDF', printAction) : '') + '</div></div>';
    }
    function selectedSection(c) {
      const allowed = sections(c, ['intro', 'objectives', 'course', 'case', 'essentials']);
      return allowed.find(s => s.id === state.section) || allowed.find(s => s.kind === 'course') || allowed[0];
    }
    function coursePanel(c) {
      const chosen = selectedSection(c); if (!chosen) return '<p class="ep-empty">Ce chapitre ne contient pas de cours rédigé.</p>';
      state.section = chosen.id;
      return panelHeader('Cours professeur', 'print-course') + '<label class="ep-label" for="' + uid + 'section">Partie du chapitre</label><select id="' + uid + 'section" data-ep-section>' + sections(c, ['intro', 'objectives', 'course', 'case', 'essentials']).map(s => '<option value="' + escape(s.id) + '"' + (s.id === chosen.id ? ' selected' : '') + '>' + escape(s.title) + '</option>').join('') + '</select><h4 class="ep-part-title">' + escape(chosen.title) + '</h4>' + reader(chosen.blocks) + footer('Source : cours ' + c.number);
    }
    function sessionsPanel(c) {
      return panelHeader('Préparer les séances') + '<p class="ep-hint">Ces séances et leurs descriptions reprennent ton document. Les durées sont indicatives.</p>' + (list(c.sessions).length ? c.sessions.map((session, i) => '<article class="ep-session"><div class="ep-number">' + escape(session.number || i + 1) + '</div><div><h4>' + escape(session.title || 'Séance ' + (i + 1)) + '</h4><p>' + escape(session.description) + '</p>' + (session.durationMinutes ? '<small>' + escape(session.durationMinutes) + ' minutes indicatives</small>' : '') + '<p class="ep-source">' + escape(sourceLabel(session.source)) + '</p>' + button('Ouvrir ma séance', 'session', 'data-ep-session="' + i + '"') + '</div></article>').join('') : '<p>Aucun découpage en séances n’est indiqué dans ce document.</p>') + '<details><summary>Objectifs et déroulement intégral</summary>' + reader(sections(c, ['objectives']).flatMap(s => s.blocks)) + '</details>';
    }
    function lessonPanel(c) {
      const sessions = list(c.sessions), chosen = sessions[state.session] || sessions[0];
      return panelHeader('Ma séance', 'print-session') + (chosen ? '<label class="ep-label" for="' + uid + 'session">Séance du chapitre</label><select id="' + uid + 'session" data-ep-session-select>' + sessions.map((s, i) => '<option value="' + i + '"' + (i === state.session ? ' selected' : '') + '>' + escape(s.title || 'Séance ' + (i + 1)) + (s.durationMinutes ? ' · ' + escape(s.durationMinutes) + ' min' : '') + '</option>').join('') + '</select><div class="ep-session-summary"><h4>' + escape(chosen.title) + '</h4><p>' + escape(chosen.description) + '</p><small>' + escape(sourceLabel(chosen.source)) + '</small></div>' : '<p class="ep-hint">Aucune séance n’est décrite séparément ; les ressources du chapitre sont disponibles ci-dessous.</p>') + '<p class="ep-hint">Les parties du cours ne sont pas attribuées automatiquement à une séance. Ouvre celles dont tu as besoin pendant ton cours.</p><div class="ep-tools">' + button('Ouvrir le quiz', 'lesson-quiz') + button('Noter mon bilan de séance', 'lesson-notes') + '</div>' + sections(c, ['objectives', 'course', 'case', 'essentials']).map(s => '<details><summary>' + escape(s.title) + '</summary>' + reader(s.blocks) + '</details>').join('');
    }
    function answerHTML(c, q) {
      const selected = state.answers[c.id + '-' + q.number], wrong = q.answerKey && selected && selected !== q.answerKey;
      return '<div class="ep-answer' + (wrong ? ' ep-incorrect' : '') + '">' + (q.answerKey ? (selected ? selected === q.answerKey ? 'Réponse conforme au corrigé.' : 'À revoir : réponse attendue ' + escape(q.answerKey) + '.' : 'Réponse attendue : ' + escape(q.answerKey) + '.') : 'Réponse ouverte : appréciation du professeur.') + '<p>' + escape(q.correction || 'Consulter le corrigé intégral.').replace(/\n/g, '<br>') + '</p></div>';
    }
    function quizPanel(c) {
      return panelHeader('Quiz du chapitre') + '<p class="ep-hint">Essai du quiz pour préparer ton cours : ces réponses ne sont ni enregistrées ni attribuées aux élèves.</p><div class="ep-tools">' + button('Imprimer le sujet élève vierge', 'print-quiz-student') + button('Imprimer le corrigé professeur', 'print-quiz-teacher') + '</div>' + (list(c.quizzes).length ? c.quizzes.map(q => '<section class="ep-quiz-item"><fieldset><legend>Q' + escape(q.number) + ' · ' + escape(q.prompt) + '</legend>' + (list(q.choices).length ? q.choices.map(choice => '<label class="ep-choice"><input type="radio" name="' + uid + 'q' + escape(q.number) + '" value="' + escape(choice.key) + '" data-ep-question="' + escape(q.number) + '"' + (state.answers[c.id + '-' + q.number] === choice.key ? ' checked' : '') + '><span>' + escape(choice.key) + ') ' + escape(choice.text) + '</span></label>').join('') : '<label class="ep-label" for="' + uid + 'q' + escape(q.number) + '">Ta réponse</label><textarea id="' + uid + 'q' + escape(q.number) + '" data-ep-question="' + escape(q.number) + '" placeholder="Réponse rédigée…">' + escape(state.answers[c.id + '-' + q.number] || '') + '</textarea>') + '</fieldset><div data-ep-feedback="' + escape(q.number) + '" aria-live="polite">' + (state.reveal ? answerHTML(c, q) : '') + '</div></section>').join('') : reader(sections(c, ['quiz']).flatMap(s => s.blocks))) + '<div class="ep-tools">' + button(state.reveal ? 'Masquer les réponses attendues' : 'Afficher les réponses attendues', 'reveal', 'aria-expanded="' + state.reveal + '"') + '</div><details><summary>Corrigé professeur intégral</summary>' + reader(sections(c, ['quiz-correction']).flatMap(s => s.blocks)) + '</details>' + footer('Source : quiz et corrigé du cours ' + c.number);
    }
    function controlsPanel(c) {
      const related = list(data.controls).filter(t => list(t.courseNumbers).some(n => String(n) === String(c.number)));
      const chosen = related.find(t => String(t.id) === state.controlId);
      if (!chosen) return panelHeader('Contrôles liés') + '<p class="ep-hint">Seuls les contrôles qui citent ce numéro de cours sont présentés.</p>' + (related.length ? related.map(t => '<article class="ep-control"><h4>' + escape(t.title) + '</h4><p>Cours concernés : ' + escape(t.courseNumbers.join(', ')) + '</p>' + button('Ouvrir le contrôle', 'control', 'data-ep-control="' + escape(t.id) + '"') + '</article>').join('') : '<p class="ep-empty">Aucun contrôle fourni ne mentionne ce chapitre.</p>');
      return button('← Contrôles liés', 'controls-back') + panelHeader(chosen.title) + '<div class="ep-tools">' + button('Sujet élève', 'control-subject', 'aria-pressed="' + !state.correction + '"') + button('Corrigé et barème', 'control-correction', 'aria-pressed="' + state.correction + '"') + '</div><p class="ep-hint">' + (state.correction ? 'Corrigé professeur' : 'Sujet élève sans corrigé') + ' · Cours ' + escape(chosen.courseNumbers.join(', ')) + '</p><div class="ep-tools">' + button('Imprimer le sujet élève', 'print-control-student') + button('Imprimer le corrigé professeur', 'print-control-teacher') + '</div>' + reader(state.correction ? chosen.correction : chosen.subject);
    }
    function sourcesPanel(c) {
      return panelHeader('Sources du chapitre', 'print-sources') + '<p class="ep-hint ep-warning">Les références ci-dessous sont celles de tes documents, pas une vérification indépendante. Une référence citée ne signifie pas que son document complet a été importé. Les liens externes demandent une connexion.</p>' + reader(sections(c, ['references']).flatMap(s => s.blocks)) + '<h4>Documents importés</h4>' + list(data.sources).map(s => '<article class="ep-source-doc"><strong>' + escape(s.filename) + '</strong><p>' + escape(s.locationMethod || 'Les repères de paragraphes ne sont pas des numéros de page.') + '</p></article>').join('');
    }
    function noteStatus(id) {
      if (saving.has(id)) return 'Enregistrement en cours…';
      if (statuses[id]) return statuses[id];
      if (drafts[id]) return 'Modifications non enregistrées. Elles restent dans cet écran tant que tu ne le quittes pas.';
      if (loadError) return loadError;
      if (notesLoading) return 'Chargement de tes notes…';
      return notes[id]?.savedAt ? 'Notes enregistrées · ' + new Date(notes[id].savedAt).toLocaleString('fr-FR') : 'Aucune note enregistrée pour ce chapitre.';
    }
    function notesPanel(c) {
      const note = noteFor(c.id);
      return panelHeader('Mes notes de préparation') + '<p class="ep-hint">Tes notes complètent le cours sans modifier les documents importés. Enregistre-les avant de quitter l’atelier.</p><label class="ep-label" for="' + uid + 'status">Avancement</label><select id="' + uid + 'status" data-ep-note-status><option value="preparer"' + (note.status !== 'enseigne' ? ' selected' : '') + '>À préparer</option><option value="enseigne"' + (note.status === 'enseigne' ? ' selected' : '') + '>Enseigné</option></select><label class="ep-label" for="' + uid + 'notes">Exemples à ajouter, bilan de séance, améliorations pour l’année prochaine…</label><textarea id="' + uid + 'notes" class="ep-notes" data-ep-note-text placeholder="Mes remarques…">' + escape(note.text || '') + '</textarea><p class="ep-status" data-ep-note-feedback aria-live="polite">' + escape(noteStatus(c.id)) + '</p><div class="ep-tools">' + button('Enregistrer mes notes', 'save-notes', 'class="ep-primary"' + (saving.has(c.id) || notesLoading || loadError ? ' disabled' : '')) + button('Exporter mes notes en texte', 'export-notes') + (loadError ? button('Réessayer le chargement', 'reload-notes') : '') + '</div>';
    }
    function render(focusAction) {
      if (destroyed) return;
      const c = chapter();
      let content;
      if (!c) content = renderHome();
      else {
        const tabs = [['course', 'Cours'], ['sessions', 'Séances'], ['quiz', 'Quiz'], ['controls', 'Contrôles'], ['sources', 'Sources'], ['notes', 'Mes notes']];
        content = button('← Tous les chapitres', 'home', 'class="ep-back"') + '<header class="ep-chapter-head"><p class="ep-eyebrow">' + escape(data.level || 'Première EPPCS') + ' · ' + escape(c.theme) + ' · Cours ' + escape(c.number) + '</p><h2>' + escape(c.title) + '</h2><p>' + escape(c.question) + '</p></header><nav class="ep-modes" aria-label="Mode de consultation">' + button('Bibliothèque', 'mode-library', 'aria-pressed="' + (state.mode === 'library') + '"') + button('Ma séance', 'mode-lesson', 'aria-pressed="' + (state.mode === 'lesson') + '"') + '</nav>' + (state.mode === 'library' ? '<nav class="ep-tabs" aria-label="Ressources du chapitre">' + tabs.map(([id, label]) => '<button type="button" data-ep-tab="' + id + '" aria-pressed="' + (state.tab === id) + '">' + label + (id === 'notes' && drafts[c.id] ? ' •' : '') + '</button>').join('') + '</nav>' : '') + '<section class="ep-panel">' + (state.mode === 'lesson' ? lessonPanel(c) : ({ course: coursePanel, sessions: sessionsPanel, quiz: quizPanel, controls: controlsPanel, sources: sourcesPanel, notes: notesPanel }[state.tab] || coursePanel)(c)) + '</section>';
      }
      root.innerHTML = '<div class="ep-workspace">' + content + '<p class="ep-notice" data-ep-notice role="status"></p></div>';
      if (focusAction) root.querySelector('[data-ep-action="' + focusAction + '"]')?.focus();
    }
    function captureDraft() {
      const c = chapter(), field = root.querySelector('[data-ep-note-text]'); if (!c || !field) return;
      const value = { text: field.value, status: root.querySelector('[data-ep-note-status]').value, title: c.title };
      if (value.text === (notes[c.id]?.text || '') && value.status === (notes[c.id]?.status || 'preparer')) delete drafts[c.id];
      else drafts[c.id] = value;
      delete statuses[c.id];
      const status = root.querySelector('[data-ep-note-feedback]'); if (status) status.textContent = noteStatus(c.id);
    }
    async function saveNotes() {
      const c = chapter(); if (!c || saving.has(c.id) || notesLoading || loadError) return;
      captureDraft(); const id = c.id, snapshot = { ...notes[id], ...noteFor(id), title: c.title, savedAt: new Date().toISOString(), base: notes[id]?.base ?? null };
      if (typeof options.saveNote !== 'function') { statuses[id] = 'Enregistrement indisponible. Exporte tes notes pour les conserver.'; render(); return; }
      saving.add(id); render();
      try {
        const result = await options.saveNote(id, snapshot);
        if (destroyed) return;
        if (result === false) throw new Error('Enregistrement refusé.');
        notes[id] = {
          ...snapshot,
          text: typeof result?.text === 'string' ? result.text : snapshot.text,
          status: ['preparer', 'enseigne'].includes(result?.status) ? result.status : snapshot.status,
          savedAt: result?.savedAt || snapshot.savedAt,
          base: result && Object.prototype.hasOwnProperty.call(result, 'base') ? result.base : snapshot.base
        };
        if (drafts[id]?.text === snapshot.text && drafts[id]?.status === snapshot.status) delete drafts[id];
        statuses[id] = drafts[id] ? 'La version envoyée est enregistrée. Tes nouvelles modifications restent à enregistrer.' : (result?.message || 'Enregistré sur cet appareil.');
      } catch (error) {
        if (!destroyed) { drafts[id] = drafts[id] || snapshot; statuses[id] = 'Impossible d’enregistrer. Ton texte est conservé dans cet écran : réessaie ou exporte-le avant de fermer.'; report(error); }
      } finally { saving.delete(id); if (!destroyed && chapter()?.id === id && state.tab === 'notes' && state.mode === 'library') render(); }
    }
    async function loadNotes() {
      notesLoading = true; loadError = ''; render();
      try {
        const loaded = typeof options.loadNotes === 'function' ? await options.loadNotes() : {};
        if (destroyed) return;
        for (const c of courses) if (loaded?.[c.id] && typeof loaded[c.id] === 'object') notes[c.id] = loaded[c.id];
      } catch (error) { if (!destroyed) { loadError = 'Tes notes enregistrées ne sont pas accessibles. Réessaie avant d’enregistrer pour ne pas remplacer une version inconnue.'; report(error); } }
      finally { notesLoading = false; if (!destroyed) render(); }
    }
    function printable(kind) {
      const c = chapter(); if (!c) return null;
      let title = c.title, subtitle = '', content = '';
      if (kind === 'quiz-student' || kind === 'quiz-teacher') {
        const teacher = kind === 'quiz-teacher'; subtitle = teacher ? 'Quiz · Corrigé professeur' : 'Quiz · Sujet élève vierge';
        content = blocks(sections(c, [teacher ? 'quiz-correction' : 'quiz']).flatMap(s => s.blocks));
      } else if (kind === 'control-student' || kind === 'control-teacher') {
        const t = list(data.controls).find(t => String(t.id) === state.controlId && list(t.courseNumbers).some(n => String(n) === String(c.number)));
        if (!t) return null; title = t.title; subtitle = kind === 'control-teacher' ? 'Corrigé professeur et barème' : 'Sujet élève sans corrigé'; content = blocks(kind === 'control-teacher' ? t.correction : t.subject);
      } else if (kind === 'sources') { subtitle = 'Références du chapitre'; content = blocks(sections(c, ['references']).flatMap(s => s.blocks)); }
      else if (kind === 'session') {
        const session = list(c.sessions)[state.session]; subtitle = session?.title || 'Ma séance';
        content = '<p>' + escape(session?.description || '') + '</p><p><em>Ressources du chapitre — leur sélection pour cette séance reste à la charge du professeur.</em></p>' + sections(c, ['objectives', 'course', 'case', 'essentials']).map(s => '<h2>' + escape(s.title) + '</h2>' + blocks(s.blocks)).join('');
      } else { const s = selectedSection(c); subtitle = s?.title || 'Cours professeur'; content = blocks(s?.blocks); }
      const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + escape(title + ' — ' + subtitle) + '</title><style>@page{margin:18mm}body{font:11pt/1.55 Arial,sans-serif;color:#172e3a}h1{font-size:20pt}h2{font-size:15pt}h3{font-size:13pt;break-after:avoid}h1,h2,h3{line-height:1.3}p{orphans:3;widows:3}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #bbc9d2;padding:7px;vertical-align:top;overflow-wrap:anywhere}tr{break-inside:avoid}a{color:inherit}header{border-bottom:1px solid #bbc9d2;margin-bottom:22px}header p{font-size:13pt}li{margin-bottom:7px}</style></head><body><header><small>Atelier EPPCS · ' + escape(data.level || 'Première') + '</small><h1>' + escape(title) + '</h1><p>' + escape(subtitle) + '</p></header>' + content + '</body></html>';
      return { title: title + ' — ' + subtitle, html };
    }
    function print(kind) {
      const output = printable(kind); if (!output) return;
      if (typeof options.onPrint === 'function') { options.onPrint(output); return; }
      if (printFrame) printFrame.remove();
      printFrame = root.ownerDocument.createElement('iframe'); printFrame.className = 'ep-print-frame'; printFrame.title = output.title;
      root.appendChild(printFrame);
      const doc = printFrame.contentDocument; doc.open(); doc.write(output.html); doc.close();
      const frame = printFrame;
      setTimeout(() => { if (destroyed || frame !== printFrame) return; try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (error) { announce('Impression indisponible dans ce navigateur.'); report(error); } }, 120);
    }
    function exportNotes() {
      const all = courses.map(c => { const n = noteFor(c.id); return n.text || n.status === 'enseigne' ? c.title + '\n' + (n.status === 'enseigne' ? 'Enseigné' : 'À préparer') + (drafts[c.id] ? ' · brouillon non enregistré' : '') + '\n' + (n.text || '') : ''; }).filter(Boolean);
      const url = URL.createObjectURL(new Blob(['Atelier EPPCS — Notes de préparation\n\n' + all.join('\n\n')], { type: 'text/plain;charset=utf-8' }));
      const link = root.ownerDocument.createElement('a'); link.href = url; link.download = 'EPPCS-notes-preparation.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function input(event) {
      const target = event.target;
      if (target.matches('[data-ep-search]')) { state.filter = target.value; root.querySelector('[data-ep-groups]').innerHTML = renderGroups(); }
      if (target.matches('[data-ep-note-text]')) captureDraft();
      if (target.matches('textarea[data-ep-question]') && chapter()) state.answers[chapter().id + '-' + target.dataset.epQuestion] = target.value;
    }
    function change(event) {
      const target = event.target;
      if (target.matches('[data-ep-section]')) { state.section = target.value; render(); root.querySelector('[data-ep-section]')?.focus(); }
      if (target.matches('[data-ep-session-select]')) { state.session = Number(target.value); render(); root.querySelector('[data-ep-session-select]')?.focus(); }
      if (target.matches('[data-ep-note-status]')) captureDraft();
      if (target.matches('[data-ep-question]') && chapter()) {
        const c = chapter(); state.answers[c.id + '-' + target.dataset.epQuestion] = target.value;
        const q = list(c.quizzes).find(q => String(q.number) === target.dataset.epQuestion);
        // Update feedback only: preserve the radio/keyboard focus after correction.
        const feedback = [...root.querySelectorAll('[data-ep-feedback]')].find(el => el.dataset.epFeedback === target.dataset.epQuestion);
        if (q && feedback && state.reveal) feedback.innerHTML = answerHTML(c, q);
      }
    }
    function click(event) {
      const target = event.target.closest('button'); if (!target || !root.contains(target)) return;
      if (target.dataset.epCourse) { captureDraft(); state.courseId = target.dataset.epCourse; state.tab = 'course'; state.mode = 'library'; state.section = ''; state.session = 0; state.controlId = null; state.reveal = false; render(); root.querySelector('.ep-back')?.focus(); return; }
      if (target.dataset.epTab) { captureDraft(); state.tab = target.dataset.epTab; state.reveal = false; render(); root.querySelector('[data-ep-tab="' + state.tab + '"]')?.focus(); return; }
      const action = target.dataset.epAction; if (!action) return;
      if (action.startsWith('print-')) { print(action.slice(6)); return; }
      if (action === 'save-notes') { void saveNotes(); return; }
      if (action === 'reload-notes') { void loadNotes(); return; }
      if (action === 'export-notes') { captureDraft(); exportNotes(); return; }
      captureDraft();
      if (action === 'home') { state.courseId = null; state.mode = 'library'; if (typeof options.onHome === 'function') options.onHome(); }
      if (action === 'font') state.large = !state.large;
      if (action === 'mode-library') state.mode = 'library';
      if (action === 'mode-lesson') state.mode = 'lesson';
      if (action === 'session') { state.session = Number(target.dataset.epSession); state.mode = 'lesson'; }
      if (action === 'lesson-quiz' || action === 'lesson-notes') { state.mode = 'library'; state.tab = action === 'lesson-quiz' ? 'quiz' : 'notes'; }
      if (action === 'reveal') state.reveal = !state.reveal;
      if (action === 'control') { state.controlId = target.dataset.epControl; state.correction = false; }
      if (action === 'controls-back') state.controlId = null;
      if (action === 'control-subject' || action === 'control-correction') state.correction = action === 'control-correction';
      render(action);
    }
    root.addEventListener('click', click); root.addEventListener('input', input); root.addEventListener('change', change);
    render(); void loadNotes();
    return {
      destroy() { destroyed = true; root.removeEventListener('click', click); root.removeEventListener('input', input); root.removeEventListener('change', change); if (printFrame) printFrame.remove(); root.replaceChildren(); root.classList.remove('eppcs-view'); },
      hasUnsavedDraft() { return Object.keys(drafts).length > 0 || saving.size > 0; },
      getDrafts() { return JSON.parse(JSON.stringify(drafts)); },
      refreshNotes(values = {}) {
        let staleDrafts = false, redraw = false;
        for (const c of courses) {
          const current = notes[c.id] || {}, incoming = values[c.id] || {};
          if (saving.has(c.id)) continue;
          const changed = ['text', 'status', 'savedAt', 'base'].some(key => JSON.stringify(current[key] ?? null) !== JSON.stringify(incoming[key] ?? null));
          if (!changed) continue;
          if (drafts[c.id]) { staleDrafts = true; continue; }
          if (values[c.id]) notes[c.id] = { ...values[c.id] }; else delete notes[c.id];
          delete statuses[c.id];
          if (chapter()?.id === c.id && state.mode === 'library' && state.tab === 'notes') redraw = true;
        }
        if (redraw && !destroyed) render();
        return staleDrafts;
      },
      getPrintableDocument: printable
    };
  }
  window.EPPCSView = Object.freeze({ mount });
})();
