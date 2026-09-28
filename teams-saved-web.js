/* Équipes sauvegardées — module isolé pour ne pas alourdir outils.js. */
(function () {
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const modes = [
    ['ALEATOIRE','Aléatoire'], ['HOMOGENE','Niveaux équivalents'],
    ['HETEROGENE','Niveaux mélangés'], ['MIXTE_EQUILIBRE','Mixité équilibrée']
  ];
  let classes = [], students = [], generated = [], saved = [], selectedClass = '', selectedSaved = null;
  let openedGroups = [], evaluations = [], levels = {};

  async function read(path) {
    const response = await apiFetch(`${SUPABASE_URL}/rest/v1/${path}`);
    if (!response.ok) throw new Error((await response.text()) || `Erreur ${response.status}`);
    return response.json();
  }
  async function write(table, row) {
    const response = await apiFetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method:'POST', headers:{Prefer:'resolution=merge-duplicates,return=minimal'}, body:JSON.stringify(row)
    });
    if (!response.ok) throw new Error((await response.text()) || `Erreur ${response.status}`);
  }
  async function softDelete(table, filter) {
    const response = await apiFetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method:'PATCH', body:JSON.stringify({deleted:true,updated_at:new Date().toISOString()})
    });
    if (!response.ok) throw new Error((await response.text()) || `Erreur ${response.status}`);
  }
  function labelStudent(s) { return `${String(s.last_name||'').toUpperCase()} ${s.first_name||''}`.trim(); }
  function distribute(list, count, mode) {
    const source = [...list];
    if (mode === 'ALEATOIRE' || mode === 'MIXTE_EQUILIBRE') {
      for(let i=source.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[source[i],source[j]]=[source[j],source[i]]}
    } else source.sort((a,b) => Number(levels[b.id])-Number(levels[a.id]));
    const teams = Array.from({length:count},()=>[]);
    if(mode==='MIXTE_EQUILIBRE'){
      const sex=s=>String(s.sex||'').toUpperCase().startsWith('F')?'F':/^(M|H|G)/.test(String(s.sex||'').toUpperCase())?'M':'?';
      for(const category of ['F','M','?'])source.filter(s=>sex(s)===category).forEach(s=>{
        const target=teams.map((g,i)=>({i,total:g.length,same:g.filter(x=>sex(x)===category).length})).sort((a,b)=>a.total-b.total||a.same-b.same)[0];teams[target.i].push(s);
      });
    } else if (mode === 'HOMOGENE') {
      const size = Math.ceil(source.length/count);
      source.forEach((s,i)=>teams[Math.min(count-1,Math.floor(i/size))].push(s));
    } else if(mode==='HETEROGENE')source.forEach((s,i)=>{const round=Math.floor(i/count),position=i%count;teams[round%2?count-1-position:position].push(s)});
    else source.forEach((s,i)=>teams[i%count].push(s));
    return teams;
  }
  globalThis.distributeToolTeams=(list,count,mode,ratings={})=>{const previous=levels;levels=ratings;try{return distribute(list,count,mode)}finally{levels=previous}};
  function teamCards(teams) {
    return `<div class="saved-team-grid">${teams.map((team,i)=>`<article class="saved-team-card"><header><i>👥</i><b>Équipe ${i+1}</b><small>${team.length} élève${team.length>1?'s':''}</small></header>${team.map(s=>`<span>${esc(labelStudent(s))}</span>`).join('')}</article>`).join('')}</div>`;
  }
  /**
   * Le tableau du socle sous les cartes : une ligne par eleve, sa colonne Equipe modifiable.
   * Le tirage au sort proposait une composition qu'il fallait accepter telle quelle - deplacer
   * un eleve obligeait a relancer le tirage entier, qui rebattait tout le reste.
   */
  function teamTable(teams) {
    if (typeof socleTableauHtml !== 'function') return '';
    const equipeDe = id => teams.findIndex(g => g.some(s => String(s.id) === String(id))) + 1;
    const tous = teams.flat();
    return `<div class="fitness-web">${socleTableauHtml(
      [{ titre: 'Équipe', aide: 'Modifiable' }],
      tous.map(s => ({ eleve: s, sousTitre: `Équipe ${equipeDe(s.id)}`,
        cellules: [`<select data-team-move="${s.id}">${teams.map((_, i) =>
          `<option value="${i}"${equipeDe(s.id) === i + 1 ? ' selected' : ''}>Équipe ${i + 1}</option>`).join('')}</select>`],
        total: null })),
      null)}</div>`;
  }
  /** Deplace un eleve d'une equipe a l'autre sans toucher aux autres. */
  function bindTeamMoves(redraw) {
    document.querySelectorAll('[data-team-move]').forEach(sel => sel.onchange = () => {
      const id = sel.dataset.teamMove, cible = +sel.value;
      let eleve = null;
      generated.forEach(g => { const i = g.findIndex(s => String(s.id) === String(id)); if (i >= 0) eleve = g.splice(i, 1)[0]; });
      if (eleve) generated[cible].push(eleve);
      redraw();
    });
  }
  function criterionRow(c){return `<div class="team-criterion-row"><input data-criterion-name="${c.id}" value="${esc(c.name)}"><label>sur <input data-criterion-max="${c.id}" type="number" min="0.25" step="0.25" value="${Number(c.max)||1}"></label><button class="danger" data-remove-criterion>×</button></div>`}
  function readCriteria(){return [...document.querySelectorAll('[data-criterion-name]')].map(n=>({id:n.dataset.criterionName,name:n.value.trim()||'Critère',max:Number(document.querySelector(`[data-criterion-max="${n.dataset.criterionName}"]`).value)||1}))}
  function collectScores(){const out={};document.querySelectorAll('[data-team-score]').forEach(i=>{(out[i.dataset.teamScore]??={})[i.dataset.criterion]=i.value});return out}
  function scoreGrid(criteria,scores={}){const max=criteria.reduce((a,c)=>a+Number(c.max),0);return `<div class="team-score-grid">${openedGroups.map((g,i)=>`<article class="team-score-card"><header><span><b>Équipe ${i+1}</b><small>${g.map(labelStudent).join(' · ')}</small></span><strong data-team-total="${i}">0 / ${max}</strong></header>${criteria.map(c=>`<label>${esc(c.name)} <span>/${c.max}</span><input data-team-score="${i}" data-criterion="${c.id}" type="number" min="0" max="${c.max}" step="0.25" value="${esc(scores?.[i]?.[c.id]??'')}"></label>`).join('')}</article>`).join('')}</div>`}
  function updateTotals(){const c=readCriteria(),max=c.reduce((a,x)=>a+x.max,0);openedGroups.forEach((_,i)=>{const total=c.reduce((s,x)=>s+(Number(document.querySelector(`[data-team-score="${i}"][data-criterion="${x.id}"]`)?.value)||0),0),el=document.querySelector(`[data-team-total="${i}"]`);if(el)el.textContent=`${total.toLocaleString('fr-FR')} / ${max.toLocaleString('fr-FR')}`})}
  function shell() {
    toolPanel.innerHTML = toolHeader('Équipes','Former, enregistrer et retrouver vos groupes') + `
      <section class="team-web-hero"><div><small>ORGANISER</small><h2>Création d’équipes</h2><p>Choisissez une classe ou saisissez des participants libres.</p></div><b>👥</b></section>
      <section class="card team-web-controls">
        <div class="team-control-line"><input id="twUsage" type="hidden" value="free"><label id="twClassWrap">Classe<select id="twClass"><option value="">Usage libre (sans classe)</option>${classes.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label></div>
        <div class="team-control-line"><label>Mode<select id="twMode">${modes.map(m=>`<option value="${m[0]}">${m[1]}</option>`).join('')}</select></label><label>Nombre d’équipes<input id="twCount" type="number" min="2" max="20" value="2"></label></div>
        <section id="twFreeWrap"><label>Participants (un nom par ligne, sexe facultatif après un point-virgule : Alex;F)<textarea id="twFree" rows="4"></textarea></label><button id="twFreeResume" class="secondary">Reprendre des équipes libres</button></section><div id="twLevels"></div><button id="twGenerate">Générer les équipes</button><p class="error" id="twError"></p>
      </section><div id="twGenerated"></div><section id="twSaved"></section>`;
    bindToolClose(); bind(); renderSaved();
  }
  function bind() {
    twMode.onchange=renderLevels;
    twFree.onchange=()=>{students=twFree.value.split('\n').map((line,i)=>{const [name,sex]=line.split(';');return {id:'free-'+i,first_name:name.trim(),last_name:'',sex:(sex||'').trim()}}).filter(s=>s.first_name);generated=[];twGenerated.innerHTML='';renderLevels()};
    twFreeResume.onclick=()=>EpsToolWorks.library('teams-free','Équipes libres',async w=>{await render();twFree.value=w.payload.names||'';twFree.onchange();generated=w.payload.groups||[];twMode.value=w.payload.mode||'ALEATOIRE';dessinerComposition()});
    twClass.onchange=async()=>{selectedClass=twClass.value;twUsage.value=selectedClass?'class':'free';twFreeWrap.hidden=!!selectedClass;generated=[];levels={};twGenerated.innerHTML='';students=selectedClass?await read(`students?class_id=eq.${selectedClass}&deleted=eq.false&select=*&order=last_name.asc`):[];if(!selectedClass)twFree.onchange();await loadSaved();renderSaved();renderLevels()};
    twGenerate.onclick=async()=>{try{twError.textContent='';if(twUsage.value==='class'&&!selectedClass)throw Error('Choisissez une classe.');if(twUsage.value==='free')twFree.onchange();if(!students.length)throw Error('Ajoutez des participants ou choisissez une classe contenant des élèves.');if(['HOMOGENE','HETEROGENE'].includes(twMode.value)&&students.some(s=>levels[s.id]==null||levels[s.id]===''||!Number.isFinite(+levels[s.id])))throw Error('Renseignez le niveau de chaque élève avant de répartir les équipes.');generated=distribute(students,Math.max(2,Math.min(20,+twCount.value||2)),twMode.value);dessinerComposition();}catch(e){twError.textContent=e.message}};
  }
  function renderLevels(){
    const host=document.getElementById('twLevels');if(!host)return;
    const required=['HOMOGENE','HETEROGENE'].includes(twMode.value);
    host.innerHTML=required?`<p>Niveau observé : plus la valeur est élevée, plus le niveau est fort. Aucun niveau n’est déduit du nom.</p>${students.map(s=>`<label>${esc(labelStudent(s))}<input type="number" step="any" data-team-level="${esc(s.id)}" value="${esc(levels[s.id]??'')}"></label>`).join('')}`:twMode.value==='MIXTE_EQUILIBRE'?'<p>Répartition selon le sexe renseigné et les effectifs. Les participants sans sexe renseigné sont répartis selon les effectifs.</p>':'';
    host.querySelectorAll('[data-team-level]').forEach(e=>e.oninput=()=>levels[e.dataset.teamLevel]=e.value);
  }
  /** Redessine la composition en cours : cartes, tableau modifiable, enregistrer et remise a zero. */
  function dessinerComposition(){
    twGenerated.innerHTML=`<section class="team-generated-head"><div><h3>Composition proposée</h3><p>${students.length} élèves · ${generated.length} équipes</p></div><div><button id="twSave">Enregistrer</button> <button class="secondary" id="twReset">↺ Réinitialiser</button></div></section>${teamCards(generated)}<div class="field-tool-row"><button id="twAddGroup" class="secondary">＋ Ajouter une équipe</button><label>Équipe à supprimer<select id="twRemoveGroup">${generated.map((_,i)=>`<option value="${i}">Équipe ${i+1}</option>`).join("")}</select></label><button id="twDeleteGroup" class="danger">Supprimer cette équipe</button><button id="twExportGroups" class="secondary">▦ Exporter</button></div>${teamTable(generated)}`;
    document.getElementById('twSave').onclick=save;
    document.getElementById('twAddGroup').onclick=()=>{generated.push([]);dessinerComposition()};
    document.getElementById('twDeleteGroup').onclick=()=>{if(generated.length<2)return alert('Conservez au moins une équipe.');if(!confirm('Supprimer cette équipe ? Ses élèves seront déplacés dans la première équipe restante.'))return;const removed=generated.splice(+twRemoveGroup.value,1)[0];generated[0].push(...removed);dessinerComposition()};
    document.getElementById('twExportGroups').onclick=()=>EpsToolWorkflow.csv('equipes.csv',[['Équipe','Élève'],...generated.flatMap((g,i)=>g.map(s=>[i+1,labelStudent(s)]))]);
    document.getElementById('twReset').onclick=()=>{if(!confirm('Défaire cette composition et repartir de zéro ?'))return;generated=[];twGenerated.innerHTML=''};
    bindTeamMoves(dessinerComposition);
  }
  async function loadSaved(){saved=selectedClass?await read(`saved_teams?class_id=eq.${selectedClass}&deleted=eq.false&select=*&order=created_at.desc`):[]}
  function renderSaved(){const host=document.getElementById('twSaved');if(!host)return;host.innerHTML=!selectedClass?'':`<div class="saved-team-title"><h3>Équipes enregistrées</h3><small>${saved.length} composition${saved.length>1?'s':''}</small></div>${saved.length?saved.map(t=>`<article class="saved-composition"><i>👥</i><span><b>${esc(t.name)}</b><small>${new Date(t.created_at).toLocaleDateString('fr-FR')} · ${esc(modes.find(m=>m[0]===t.mode)?.[1]||t.mode)}</small></span><button data-open-team="${t.id}">Ouvrir</button><button class="danger" data-delete-team="${t.id}">Supprimer</button></article>`).join(''):'<div class="card muted">Aucune composition enregistrée pour cette classe.</div>'}`;host.querySelectorAll('[data-open-team]').forEach(b=>b.onclick=()=>openSaved(b.dataset.openTeam));host.querySelectorAll('[data-delete-team]').forEach(b=>b.onclick=()=>removeSaved(b.dataset.deleteTeam));}
  async function save(){try{if(!selectedClass){const title=prompt('Nom des équipes libres','Équipes libres');if(title){await EpsToolWorks.save('teams-free',title,{names:twFree.value,groups:generated,mode:twMode.value},{classId:null,period:1});twError.textContent='Équipes libres enregistrées.';}return;}const name=prompt('Nom de cette composition :',`Équipes du ${new Date().toLocaleDateString('fr-FR')}`);if(!name)return;const id=crypto.randomUUID(),now=new Date().toISOString();await write('saved_teams',{id,user_id:session.user_id,class_id:selectedClass,name,mode:twMode.value,created_at:now,updated_at:now,deleted:false});for(let i=0;i<generated.length;i++)for(const s of generated[i])await write('saved_team_members',{id:crypto.randomUUID(),user_id:session.user_id,saved_team_id:id,student_id:s.id,team_index:i,updated_at:now,deleted:false});generated=[];twGenerated.innerHTML='';await loadSaved();renderSaved()}catch(e){twError.textContent=e.message.includes('saved_teams')?'Exécutez schema_rattrapage_web.sql dans Supabase avant la première sauvegarde.':e.message}}
  async function openSaved(id){const t=saved.find(x=>x.id===id);if(!t)return;const members=await read(`saved_team_members?saved_team_id=eq.${id}&deleted=eq.false&select=*&order=team_index.asc`);openedGroups=[];members.forEach(m=>{(openedGroups[m.team_index]??=[]).push(students.find(s=>s.id===m.student_id)||{last_name:'Élève',first_name:''})});selectedSaved=t;evaluations=await read(`team_evaluations?saved_team_id=eq.${id}&deleted=eq.false&select=*&order=created_at.desc`).catch(()=>[]);renderOpened()}
  function renderOpened(){twGenerated.innerHTML=`<section class="team-generated-head"><div><h3>${esc(selectedSaved.name)}</h3><p>${openedGroups.length} équipes enregistrées</p></div><div><button id="twEditCopy" class="secondary">Modifier une copie</button><button id="twEvaluate">＋ Évaluer</button> <button class="secondary" id="twCloseSaved">Fermer</button></div></section>${teamCards(openedGroups)}<section class="team-eval-list"><div class="saved-team-title"><h3>Évaluations</h3><small>${evaluations.length}</small></div>${evaluations.length?evaluations.map(e=>`<article class="saved-composition"><i>📝</i><span><b>${esc(e.title)}</b><small>${new Date(e.created_at).toLocaleDateString('fr-FR')}</small></span><button data-open-eval="${e.id}">Ouvrir</button><button class="danger" data-delete-eval="${e.id}">Supprimer</button></article>`).join(''):'<div class="card muted">Aucune évaluation enregistrée.</div>'}</section>`;twEditCopy.onclick=()=>{generated=structuredClone(openedGroups);twMode.value=selectedSaved.mode;dessinerComposition();twError.textContent='Vous modifiez une copie : les évaluations de la composition originale sont conservées.'};twCloseSaved.onclick=()=>twGenerated.innerHTML='';twEvaluate.onclick=()=>renderEvaluation();twGenerated.querySelectorAll('[data-open-eval]').forEach(b=>b.onclick=()=>renderEvaluation(evaluations.find(e=>e.id===b.dataset.openEval)));twGenerated.querySelectorAll('[data-delete-eval]').forEach(b=>b.onclick=async()=>{if(confirm('Supprimer cette évaluation ?')){await softDelete('team_evaluations',`id=eq.${b.dataset.deleteEval}`);evaluations=evaluations.filter(e=>e.id!==b.dataset.deleteEval);renderOpened()}})}
  function renderEvaluation(existing){const criteria=existing?.criteria_json?.length?existing.criteria_json:[{id:crypto.randomUUID(),name:'Technique',max:8}],scores=existing?.scores_json||{};twGenerated.innerHTML=`<section class="team-eval-shell"><header class="team-eval-hero"><button id="teBack">←</button><div><small>ÉVALUATION PAR ÉQUIPES</small><h2>${esc(selectedSaved.name)}</h2></div><b>📝</b></header><section class="card team-eval-settings"><label>Nom<input id="teTitle" value="${esc(existing?.title||'Évaluation des équipes')}"></label><div class="team-eval-heading"><h3>Critères</h3><button class="secondary" id="teAdd">＋ Ajouter</button></div><div id="teCriteria">${criteria.map(criterionRow).join('')}</div></section><section id="teGrid">${scoreGrid(criteria,scores)}</section><div class="team-eval-actions"><button id="teSave">💾 Enregistrer</button><button class="secondary" id="teExcel">▦ Excel</button><button class="secondary" id="tePdf">▤ PDF</button></div><p class="error" id="teError"></p></section>`;const redraw=()=>{const old=collectScores(),c=readCriteria();teGrid.innerHTML=scoreGrid(c,old);bindScores()};const bindCriteria=()=>{document.querySelectorAll('[data-criterion-name],[data-criterion-max]').forEach(x=>x.onchange=redraw);document.querySelectorAll('[data-remove-criterion]').forEach(x=>x.onclick=()=>{x.parentElement.remove();redraw()})};const bindScores=()=>document.querySelectorAll('[data-team-score]').forEach(x=>x.oninput=updateTotals);teBack.onclick=renderOpened;teAdd.onclick=()=>{teCriteria.insertAdjacentHTML('beforeend',criterionRow({id:crypto.randomUUID(),name:'Nouveau critère',max:5}));bindCriteria();redraw()};bindCriteria();bindScores();updateTotals();teSave.onclick=()=>saveEvaluation(existing,readCriteria(),collectScores());teExcel.onclick=()=>exportEvaluation('csv');tePdf.onclick=()=>exportEvaluation('pdf')}
  async function saveEvaluation(existing,criteria,scores){try{const now=new Date().toISOString();await write('team_evaluations',{id:existing?.id||crypto.randomUUID(),user_id:session.user_id,saved_team_id:selectedSaved.id,class_id:selectedClass,title:teTitle.value.trim()||'Évaluation des équipes',criteria_json:criteria,scores_json:scores,created_at:existing?.created_at||now,updated_at:now,deleted:false});evaluations=await read(`team_evaluations?saved_team_id=eq.${selectedSaved.id}&deleted=eq.false&select=*&order=created_at.desc`);renderOpened()}catch(e){teError.textContent=e.message.includes('team_evaluations')?'Relancez schema_rattrapage_web.sql dans Supabase.':e.message}}
  function exportEvaluation(format){const c=readCriteria(),s=collectScores(),title=teTitle.value.trim()||'Evaluation equipes',rows=[['Équipe','Élèves',...c.map(x=>`${x.name} / ${x.max}`),'Total'],...openedGroups.map((g,i)=>{const v=c.map(x=>Number(s?.[i]?.[x.id])||0);return[`Équipe ${i+1}`,g.map(labelStudent).join(' | '),...v,v.reduce((a,b)=>a+b,0)]})];if(format==='csv'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';')).join('\n')],{type:'text/csv'}));a.download=`${title}.csv`;a.click()}else{const w=window.open('','_blank');w.document.write(`<title>${esc(title)}</title><style>body{font-family:Arial;padding:30px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd6e5;padding:8px}th{background:#087dcc;color:white}</style><h1>${esc(title)}</h1><table>${rows.map((r,i)=>`<tr>${r.map(v=>`<${i?'td':'th'}>${esc(v)}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</table>`);w.document.close();w.print()}}
  async function removeSaved(id){if(!confirm('Supprimer cette composition d’équipes ? Les élèves ne seront pas supprimés.'))return;await softDelete('saved_team_members',`saved_team_id=eq.${id}`);await softDelete('saved_teams',`id=eq.${id}`);await loadSaved();renderSaved();twGenerated.innerHTML='';}
  async function render(){selectedClass='';students=[];generated=[];saved=[];levels={};toolPanel.innerHTML=toolHeader('Équipes','Chargement…');bindToolClose();try{classes=await read('classes?deleted=eq.false&select=id,name&order=name.asc');shell()}catch(e){toolPanel.innerHTML=toolHeader('Équipes','Groupes et tirage au sort')+`<p class="error">${esc(e.message)}</p>`;bindToolClose()}}
  globalThis.renderTeamsTool=render;
})();
