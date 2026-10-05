/* Shared local adapter for Chrome and Android WebView. No network or credential access. */
(() => {
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('fr').replace(/[^A-Z0-9]+/g, ' ').trim();
  const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const cells = row => [...row.querySelectorAll('td,[role="cell"],[role="gridcell"]')].filter(c => c.closest('tr,[role="row"]') === row);
  function validate(data) {
    if (data?.format !== 'eps-pronote-v1' || !Array.isArray(data.rows) || !data.rows.length || data.rows.length > 200) throw Error('Transfert EPS invalide ou vide.');
    if (!(Number(data.scale) > 0 && Number(data.scale) <= 1000)) throw Error('Barème invalide.');
    const names = new Set();
    for (const row of data.rows) {
      if (typeof row.lastName !== 'string' || typeof row.firstName !== 'string' || !row.lastName.trim() || !row.firstName.trim()) throw Error('Nom ou prénom manquant.');
      const name = norm(row.lastName + ' ' + row.firstName);
      if (names.has(name)) throw Error('Homonymes dans le transfert : vérification manuelle nécessaire.');
      names.add(name);
      if (typeof row.value !== 'string' || !/^(?:|A|D|\d+(?:[,.]\d+)?)$/.test(row.value)) throw Error('Valeur de note invalide.');
      if (/^\d/.test(row.value) && Number(row.value.replace(',', '.')) > Number(data.scale)) throw Error('Une note dépasse le barème.');
    }
    return data;
  }
  function open(raw) {
    const data = validate(raw);
    if (location.origin !== 'https://3500010j.index-education.net' || !location.pathname.startsWith('/pronote/')) throw Error('Ce transfert est réservé au PRONOTE du lycée.');
    globalThis.EpsPronoteBridge.close?.();
    document.getElementById('eps-pronote-bridge')?.remove();
    const host = document.createElement('div'); host.id = 'eps-pronote-bridge';
    host.style.cssText = 'position:fixed;right:8px;top:8px;z-index:2147483647;width:min(440px,96vw);max-height:90vh;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>:host{font:14px system-ui;color:#183e55}section,#pickerHint{background:white;border:2px solid #087dca;border-radius:16px;padding:16px;max-height:85vh;overflow:auto;box-shadow:0 8px 32px #0004}button{padding:10px;margin:6px 4px 6px 0;border:1px solid #087dca;border-radius:8px;background:#eef7ff;color:#164969}button:disabled{opacity:.5}table{font-size:12px;border-collapse:collapse;width:100%}th,td{padding:5px;border-bottom:1px solid #ddd;text-align:left}th{color:#587186;background:#eef7ff;position:sticky;top:0}p{white-space:pre-wrap}input{margin:8px}#pickerHint[hidden],section[hidden]{display:none}#pickerHint{font-weight:700}</style>
      <section id="panel"><button id="close" style="float:right">Fermer</button><h3>Transfert EPS · version 0.1.8</h3><p id="info"></p>
      <p>Ouvrez le devoir voulu puis choisissez une cellule de sa colonne de notes.</p><button id="pick">Choisir la colonne</button><small>Le panneau va se masquer pendant la sélection.</small>
      <p id="status" role="status"></p><table id="preview"><thead><tr><th>Élève</th><th>Note EPS</th><th>Dans PRONOTE</th></tr></thead><tbody></tbody></table>
      <label><input id="confirm" type="checkbox">Je confirme la classe, le devoir et le barème affichés dans PRONOTE.</label>
      <button id="fill" disabled>Remplir les cellules vides</button>
      <button id="test" disabled>Tester une seule note</button>
      <p>Les notes existantes sont conservées. Une saisie peut être enregistrée immédiatement par PRONOTE. Contrôlez ensuite le devoir dans PRONOTE.</p></section>
      <div id="pickerHint" hidden>Cliquez maintenant dans une cellule de la colonne du devoir.<br><button id="cancelPick">Annuler</button></div>`;
    document.body.append(host);
    const get = id => root.getElementById(id), status = message => { get('status').textContent = message; };
    get('info').textContent = `${data.className} · ${data.title}\n${data.date} · /${data.scale} · coefficient ${data.coefficient || 1}`;
    let plan = null, picking = false, running = false, cancelled = false;
    let verifiedGridCells = new WeakSet();
    const showPicker = active => {
      get('panel').hidden = active;
      get('pickerHint').hidden = !active;
      get('panel').style.display = active ? 'none' : 'block';
      get('pickerHint').style.display = active ? 'block' : 'none';
      host.style.top = active ? 'auto' : '8px';
      host.style.bottom = active ? '12px' : 'auto';
      host.style.width = active ? 'min(320px,92vw)' : 'min(440px,96vw)';
    };
    const stopPick = () => { picking = false; document.removeEventListener('click', choose, true); showPicker(false); };
    const close = () => { cancelled = true; stopPick(); host.remove(); };
    get('close').onclick = close;
    globalThis.EpsPronoteBridge.close = close;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    function gridPrefix(table) { return table.id.replace(/_grid_\d+$/, ''); }
    function gridEntry(table, column, source) {
      const prefix = gridPrefix(table), name = norm(source.lastName + ' ' + source.firstName);
      const headers = [...table.querySelectorAll('[role="rowheader"]')].filter(h => h.closest('.liste_content_lignes') === table && norm(h.textContent) === name);
      if (headers.length !== 1) throw Error(`Élève introuvable ou ambigu : ${source.lastName} ${source.firstName}.`);
      const header = headers[0].closest('.liste_celluleGrid');
      const suffix = header?.id.slice(prefix.length).match(/^_\d+_(\d+)$/);
      if (!suffix || !header.id.startsWith(prefix + '_')) throw Error('Ligne PRONOTE non reconnue.');
      const id = `${prefix}_${column}_${suffix[1]}`;
      const found = [...table.children].filter(c => c.id === id && c.dataset.colonne === String(column));
      if (found.length !== 1) throw Error('Cellule PRONOTE manquante ou ambiguë.');
      const cell = found[0], display = [...cell.querySelectorAll('[role="gridcell"]')].find(c => c.id === id + '_div');
      const inputs = [...cell.querySelectorAll('input')].filter(i => i.id === prefix + '_Edition' && visible(i) && !i.disabled && !i.readOnly && i.type === 'text');
      if (inputs.length > 1) throw Error('Champ de note ambigu.');
      const markedEditable = display?.getAttribute('aria-describedby')?.split(/\s+/).includes(prefix + '_celEdit');
      // PRONOTE can replace the display node while editing. Trust only the exact
      // cell already verified in this preview, with its own scoped Edition input.
      if (!markedEditable && !(verifiedGridCells.has(cell) && inputs.length === 1)) {
        if (verifiedGridCells.has(cell)) throw Error('La structure de la cellule a changé pendant la saisie. Transfert arrêté ; contrôlez la case avant de réessayer.');
        throw Error('Choisissez une colonne de devoir modifiable, pas la moyenne. Si une case est en cours de saisie, fermez-la avec Échap puis recommencez.');
      }
      if (markedEditable) verifiedGridCells.add(cell);
      return {source,cell,display,input:inputs[0] || null,before: inputs.length ? inputs[0].value.trim() : display.textContent.trim(),dynamic:true};
    }
    function readPlan(table, column) {
      if (!table.isConnected) throw Error('Le tableau a changé. Refaites la vérification.');
      if (table.matches('.liste_content_lignes') && /_grid_\d+$/.test(table.id)) return data.rows.map(source => gridEntry(table,column,source));
      const rows = [...table.querySelectorAll('tr,[role="row"]')].filter(r => r.closest('table,[role="grid"],[role="table"]') === table && visible(r));
      return data.rows.map(source => {
        const name = norm(source.lastName + ' ' + source.firstName);
        const matches = rows.filter(row => cells(row).some(c => norm(c.textContent) === name));
        if (matches.length !== 1) throw Error(`Élève introuvable ou ambigu : ${source.lastName} ${source.firstName}. Tous les élèves doivent être visibles.`);
        const cell = cells(matches[0])[column];
        if (!cell || norm(cell.textContent) === name) throw Error('Colonne de notes non reconnue.');
        const inputs = [...cell.querySelectorAll('input')].filter(i => visible(i) && !i.disabled && !i.readOnly && ['text','number',''].includes(i.type));
        const before = inputs.length === 1 ? inputs[0].value : cell.textContent.trim();
        return { source, cell, before, input: inputs.length === 1 ? inputs[0] : null };
      });
    }
    function choose(event) {
      if (!picking || event.composedPath().includes(host)) return;
      const cell = event.target.closest?.('td,[role="cell"],[role="gridcell"]');
      const row = cell?.closest('tr,[role="row"]');
      const gridCell = event.target.closest?.('.liste_celluleGrid[data-colonne]');
      const grid = gridCell?.closest('.liste_content_lignes');
      const table = grid || row?.closest('table,[role="grid"],[role="table"]');
      event.preventDefault(); event.stopImmediatePropagation(); stopPick();
      try {
        if (!table) throw Error('Tableau non reconnu : adaptation de cette version de PRONOTE nécessaire. Aucune note saisie.');
        const column = grid ? gridCell.dataset.colonne : cells(row).indexOf(cell), entries = readPlan(table, column);
        // Initial adapter deliberately accepts only standard editable cells; never guesses global editors.
        if (entries.some(e => e.source.value && !e.before && !e.input && !e.dynamic)) throw Error('Éditeur PRONOTE non reconnu : adaptation nécessaire. Aucune note saisie.');
        if (entries.some(e => e.dynamic && !e.before && /^[AD]$/.test(e.source.value))) throw Error('Annotations absent/dispensé : saisissez-les manuellement dans PRONOTE. Leur correspondance n’est pas encore validée.');
        plan = { table, column, entries }; renderPreview(entries);
        get('fill').textContent = 'Remplir les cellules vides';
        status(`${entries.length} élèves reconnus. ${entries.filter(e => !e.before && e.source.value).length} cellules à remplir.`); update();
      } catch (e) { plan = null; status(e.message); update(); }
    }
    function renderPreview(entries) {
        const body = get('preview').querySelector('tbody');
        body.replaceChildren();
        for (const e of entries) {
          const tr = document.createElement('tr');
          const targetState = e.before ? `Déjà notée : ${e.before}` : e.source.value ? 'À remplir' : 'Ignorée · non noté';
          for (const text of [`${e.source.lastName} ${e.source.firstName}`, e.source.value || 'Non noté', targetState]) {
            const td = document.createElement('td'); td.textContent = text; tr.append(td);
          }
          body.append(tr);
        }
    }
    function update() { get('test').disabled = get('fill').disabled = running || !plan || !get('confirm').checked; }
    get('confirm').onchange = update;
    get('pick').onclick = () => { plan = null; verifiedGridCells = new WeakSet(); get('confirm').checked = false; update(); picking = true; showPicker(true); document.addEventListener('click', choose, true); status('Cliquez dans une cellule de notes du devoir.'); };
    get('cancelPick').onclick = () => { stopPick(); status('Sélection de la colonne annulée.'); };
    async function fill(limit = Infinity) {
      if (!plan || running || !get('confirm').checked) return;
      running = true; get('pick').disabled = true; update(); let count = 0, keepPlan = false;
      try {
        const fresh = readPlan(plan.table, plan.column);
        if (fresh.some((e, i) => e.cell !== plan.entries[i].cell || e.before !== plan.entries[i].before)) throw Error('Le tableau a changé. Refaites la vérification.');
        for (const entry of fresh) {
          if (cancelled || !host.isConnected || count >= limit) break;
          if (entry.before || !entry.source.value) continue;
          let current = readPlan(plan.table, plan.column).find(e => e.source === entry.source);
          if (current?.dynamic && !current.input && current.cell === entry.cell && !current.before) {
            current.cell.scrollIntoView({block:'nearest',inline:'nearest'});
            current.display.focus();
            current.display.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,detail:1}));
            current.display.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,view:window,detail:2}));
            for (let i=0;i<10&&!cancelled;i++) {
              await wait(100);
              current = readPlan(plan.table,plan.column).find(e=>e.source===entry.source);
              if(current.input)break;
            }
          }
          if(cancelled || !host.isConnected)break;
          if (current?.dynamic && !current.input) throw Error('PRONOTE n’a pas ouvert le champ de saisie. Aucune note saisie dans cette case : transfert arrêté.');
          if (!current?.input?.isConnected || current.cell !== entry.cell || current.before) throw Error('La cellule a changé : transfert arrêté.');
          const input = current.input;
          if (input.type === 'number' && /[AD]/.test(entry.source.value)) throw Error('Cette cellule refuse les annotations A/D.');
          const value = input.type === 'number' ? entry.source.value.replace(',', '.') : entry.source.value;
          input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
          if (current.dynamic) input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
          input.blur();
          await new Promise(resolve => setTimeout(resolve, 200));
          if (current.dynamic) {
            const sameNumber = v => /^\d+(?:[,.]\d+)?$/.test(v) && Number(v.replace(',','.'))===Number(value.replace(',','.'));
            let confirmed=false;
            for(let i=0;i<10;i++) {
              if(cancelled || !host.isConnected)break;
              const check=readPlan(plan.table,plan.column).find(e=>e.source===entry.source);
              if(check.cell!==entry.cell)break;
              // Only rendered cell text counts; an editor merely retaining its value is insufficient.
              if(!check.input && sameNumber(check.display.textContent.trim())){confirmed=true;break;}
              await wait(100);
            }
            if(!confirmed)throw Error('Saisie tentée mais affichage non confirmé : arrêt. Vérifiez cette note dans PRONOTE avant de réessayer.');
          } else if (!input.isConnected || input.value !== value) throw Error('Saisie non confirmée dans la cellule : transfert arrêté.');
          count++;
        }
        status(`${count} cellule(s) remplie(s). Enregistrement serveur non vérifié : contrôlez le devoir dans PRONOTE.`);
        if(limit===1 && count===1 && !cancelled) {
          const updated=readPlan(plan.table,plan.column);
          if(updated.some(e=>!e.before&&e.source.value)) {
            plan.entries=updated;renderPreview(updated);keepPlan=true;
            get('fill').textContent='Vérifier et transférer les notes restantes';
            status('Note test saisie — vérifiez-la dans PRONOTE. Vous pouvez ensuite vérifier et transférer les notes restantes sans choisir à nouveau la colonne. La sauvegarde serveur n’est pas vérifiée par l’extension.');
          }
        }
      } catch (e) { status(`${count} cellule(s) remplie(s). ${e.message}`); }
      finally { running = false; if(!keepPlan)plan = null; get('pick').disabled = false; update(); }
    }
    get('fill').onclick = () => fill();
    get('test').onclick = () => fill(1);
  }
  globalThis.EpsPronoteBridge = { open, validate, close: globalThis.EpsPronoteBridge?.close };
})();
