/* ASLVH downloads: the same enrollment rules as UnssDownloadSnapshot in Android. */
(function(root) {
  const key = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();
  const compare = (a,b) => String(a || '').localeCompare(String(b || ''), 'fr');
  const label = slot => [slot.activity_name, slot.day_of_week && (slot.day_of_week[0] + slot.day_of_week.slice(1).toLowerCase()),
    [slot.start_time,slot.end_time].filter(Boolean).map(t => String(t).slice(0,5)).join('-'), slot.location].filter(Boolean).join(' · ');
  function createSnapshot(data) {
    const students = [...new Map(data.students.filter(s => s.licensed && !s.deleted).map(s => [String(s.id),s])).values()];
    const ids = new Set(students.map(s => String(s.id)));
    const slots = new Map(data.slots.filter(s => !s.deleted).map(s => [String(s.id),s]));
    const groups = new Map((data.groups || []).filter(g => g.active && !g.deleted).map(g => [String(g.id),g]));
    const enrollments = new Map();
    for (const m of data.memberships) {
      if (m.deleted || !ids.has(String(m.student_id))) continue;
      // UUIDs on the site correspond to positive local slot IDs in Android.
      const hasSlot = m.slot_id != null && String(m.slot_id) !== '' && String(m.slot_id) !== '0';
      const slot = hasSlot ? slots.get(String(m.slot_id)) : groups.get(String(m.group_id));
      if (!slot || !String(slot.activity_name || '').trim()) continue;
      const activity = {key:key(slot.activity_name),label:String(slot.activity_name).trim()};
      const entry = {activity, label:label(slot)};
      const entries = enrollments.get(String(m.student_id)) || [];
      if (!entries.some(e => e.activity.key === activity.key && e.label === entry.label)) entries.push(entry);
      enrollments.set(String(m.student_id),entries);
    }
    const activities = [...new Map([...enrollments.values()].flat().map(e => [e.activity.key,e.activity])).values()]
      .sort((a,b) => compare(a.key,b.key));
    return {students,enrollments,activities,slots};
  }
  function report(snapshot, kind = 'all', selected = '', includeDetails = false) {
    if (!['all','activity','missing'].includes(kind)) throw Error('Unknown AS report');
    const rows = [], included = new Set();
    const names = entries => [...new Map(entries.map(e => [e.activity.key,e.activity])).values()].sort((a,b) => compare(a.key,b.key));
    const allNames = entries => names(entries).map(a => a.label).join(' · ') || 'Aucune inscription à un créneau';
    const sorted = [...snapshot.students].sort((a,b) => compare(a.last_name,b.last_name) || compare(a.first_name,b.first_name) || compare(a.id,b.id));
    for (const student of sorted) {
      const actual = snapshot.enrollments.get(String(student.id)) || [];
      const matching = actual.filter(e => !selected || e.activity.key === selected);
      if (kind !== 'all' && selected && !matching.length) continue;
      const identity = [String(student.last_name || '').toLocaleUpperCase('fr'),student.first_name || '',student.division || student.school_class_label || student.class_label || ''];
      if (kind === 'all') {
        const row=[...identity,allNames(actual),student.jersey_size || ''];
        if(includeDetails)row.push(student.student_email || '',...[1,2,3].map(rank=>student['wish'+rank] ||
          (snapshot.slots.get(String(student['wish'+rank+'_slot_id'])) ? label(snapshot.slots.get(String(student['wish'+rank+'_slot_id']))) : '')));
        rows.push(row);
      }
      if (kind === 'missing') {
        const missing = [student.payment_missing && 'Paiement',student.medical_certificate_missing && 'Certificat médical'].filter(Boolean);
        if (!missing.length) continue;
        rows.push([...identity,allNames(actual),missing.join(' · ')]);
      }
      if (kind === 'activity') {
        const activities = names(matching);
        if (!activities.length) continue;
        for (const activity of activities) rows.push([activity.label,...identity,
          [...new Set(matching.filter(e => e.activity.key === activity.key).map(e => e.label))].sort(compare).join(' / '),student.jersey_size || '']);
      }
      included.add(String(student.id));
    }
    if (kind === 'activity') rows.sort((a,b) => compare(a[0],b[0]) || compare(a[1],b[1]) || compare(a[2],b[2]));
    const title = {all:'ASLVH · Tous les inscrits',activity:'ASLVH · Inscrits par activité',missing:'ASLVH · Dossiers incomplets'}[kind]
      + (snapshot.activities.find(a => a.key === selected)?.label && kind !== 'all' ? ' · ' + snapshot.activities.find(a => a.key === selected).label : '');
    const headers = kind === 'activity' ? ['Activité AS','Nom','Prénom','Classe / Division','Créneaux','Taille maillot']
      : ['Nom','Prénom','Classe / Division','Activités AS',kind === 'missing' ? 'Éléments manquants' : 'Taille maillot'];
    if(kind==='all' && includeDetails)headers.push('E-mail élève','Vœu 1','Vœu 2','Vœu 3');
    return {title,headers,rows,studentCount:included.size,context:`${included.size} élève(s) · ${rows.length} ligne(s)`};
  }
  function wrap(text,width,measure) {
    return String(text ?? '').split(/\r?\n/).flatMap(paragraph => {
      const lines = []; let rest = paragraph;
      while (rest) {
        let low = 1, high = rest.length, count = 1;
        while (low <= high) { const mid = Math.floor((low + high)/2); if (measure(rest.slice(0,mid)) <= width) {count=mid;low=mid+1} else high=mid-1; }
        if (count < rest.length) { const space=rest.lastIndexOf(' ',count-1); if(space>0)count=space; }
        lines.push(rest.slice(0,count)); rest=rest.slice(count).trimStart();
      }
      return lines.length ? lines : [''];
    });
  }
  function pdfCommands(data, measure, escape) {
    const weights = data.headers.map(h => ['Activités AS','Créneaux'].includes(h) ? 3 : h==='Éléments manquants' ? 2.3 : ['Classe / Division','Taille maillot'].includes(h) ? 1.2 : 1.6);
    const sum=weights.reduce((a,b)=>a+b,0), widths=weights.map(w=>778*w/sum);
    const heads=data.headers.map((h,i)=>wrap(h,widths[i]-10,measure)), headLines=Math.max(...heads.map(c=>c.length));
    const pages=[]; let content='', y=0;
    const text=(x,py,value,size=9)=>`BT /F1 ${size} Tf ${x.toFixed(2)} ${py.toFixed(2)} Td (${escape(value)}) Tj ET\n`;
    function cells(values,offset,count) {
      let x=32;
      values.forEach((lines,i)=>{for(let line=0;line<count;line++)if(lines[offset+line]!==undefined)content+=text(x+5,y-13-line*13,lines[offset+line]);x+=widths[i]});
      y-=count*13+10;content+=`0.82 0.87 0.91 RG 32 ${y.toFixed(2)} m 810 ${y.toFixed(2)} l S\n`;
    }
    function next() {
      if(content)pages.push(content);
      content='0.07 0.22 0.34 rg\n';y=559;
      wrap(data.title,778,measure).forEach(line=>{content+=text(32,y,line,9);y-=14});
      content+=text(32,y,data.context);y-=14;
      content+=text(745,18,`Page ${pages.length+1}`);
      cells(heads,0,headLines);
    }
    next();
    for(const row of data.rows) {
      const cellsText=data.headers.map((_,i)=>wrap(row[i],widths[i]-10,measure));
      const n=Math.max(...cellsText.map(c=>c.length));
      if(n*13+10<=430 && y-n*13-10<34)next();
      let offset=0;
      while(offset<n) {
        let capacity=Math.floor((y-34-10)/13);
        if(capacity<1){next();capacity=Math.floor((y-34-10)/13)}
        const count=Math.min(Math.max(1,capacity),n-offset);cells(cellsText,offset,count);offset+=count;
        if(offset<n)next();
      }
    }
    pages.push(content);return pages;
  }
  function open(options) {
    document.getElementById('unssExportDialog')?.__asClose?.();
    document.getElementById('unssExportDialog')?.remove();
    const previous=document.activeElement, overlay=document.createElement('div');
    overlay.id='unssExportDialog';overlay.className='unified-export-overlay as-download-overlay';
    overlay.innerHTML=`<section class="unified-export-dialog as-download-dialog" role="dialog" aria-modal="true" aria-labelledby="asDownloadTitle">
      <header><div><h3 id="asDownloadTitle">Télécharger une liste AS</h3></div><button type="button" data-as-close aria-label="Fermer">×</button></header>
      <main><fieldset><legend>Quelle liste souhaitez-vous ?</legend>
      <label><input type="radio" name="asDownloadKind" value="all" checked> Tous les élèves inscrits</label>
      <label><input type="radio" name="asDownloadKind" value="activity"> Les inscrits par activité AS</label>
      <label><input type="radio" name="asDownloadKind" value="missing"> Les dossiers incomplets</label></fieldset>
      <label data-as-activity-wrap hidden>Activité AS<select data-as-activity><option value="">Toutes les activités</option></select></label>
      <label data-as-details-wrap><input type="checkbox" data-as-details> Ajouter l’e-mail et les trois vœux</label>
      <p data-as-description></p><p data-as-count role="status" aria-live="polite">Chargement des inscriptions…</p>
      <fieldset><legend>Format</legend><div class="as-download-formats"><label><input type="radio" name="asDownloadFormat" value="xlsx" checked> Excel (.xlsx)</label><label><input type="radio" name="asDownloadFormat" value="pdf"> PDF</label></div></fieldset>
      <p class="muted">Les listes utilisent les données disponibles sur cet appareil.</p><p data-as-error role="alert" class="error"></p><button type="button" data-as-retry hidden>Réessayer</button></main>
      <footer><button type="button" class="secondary" data-as-close>Annuler</button><button type="button" data-as-download disabled>Télécharger</button></footer></section>`;
    document.body.appendChild(overlay);
    let snapshot=null, currentReport=null, loading=false, generation=0;
    const current=()=>overlay.isConnected && options.isCurrent();
    const count=overlay.querySelector('[data-as-count]'), error=overlay.querySelector('[data-as-error]'), download=overlay.querySelector('[data-as-download]');
    const activity=overlay.querySelector('[data-as-activity]'), retry=overlay.querySelector('[data-as-retry]');
    const kind=()=>overlay.querySelector('[name="asDownloadKind"]:checked').value;
    const interval=setInterval(()=>{if(!current())close()},500);
    function close(){clearInterval(interval);generation++;overlay.remove();document.removeEventListener('keydown',keys);if(previous?.isConnected)previous.focus()}
    overlay.__asClose=close;
    function keys(event){
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}
      if(event.key==='Tab'){
        const nodes=[...overlay.querySelectorAll('button,input,select')].filter(n=>!n.disabled && n.getClientRects().length);
        const first=nodes[0],last=nodes[nodes.length-1];
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus()}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus()}
      }
    }
    document.addEventListener('keydown',keys);
    overlay.querySelectorAll('[data-as-close]').forEach(b=>b.onclick=close);
    overlay.onclick=event=>{if(event.target===overlay)close()};
    function update(){
      const chosen=kind();overlay.querySelector('[data-as-activity-wrap]').hidden=chosen==='all';
      overlay.querySelector('[data-as-details-wrap]').hidden=chosen!=='all';
      overlay.querySelector('[data-as-description]').textContent={all:'Une ligne par licencié, avec ses activités AS et sa taille de maillot.',activity:'Les inscriptions effectives, regroupées par activité, avec les créneaux. Les vœux seuls ne sont pas des inscriptions.',missing:'Paiement et/ou certificat médical manquant, avec les activités de chaque élève.'}[chosen];
      currentReport=snapshot?report(snapshot,chosen,activity.value,overlay.querySelector('[data-as-details]').checked):null;
      download.disabled=loading || !currentReport?.rows.length;
      if(currentReport)count.textContent=currentReport.rows.length?currentReport.context+' à télécharger.':chosen==='missing'?'Aucun dossier incomplet pour cette sélection.':'Aucune inscription pour cette sélection.';
    }
    overlay.querySelectorAll('[name="asDownloadKind"]').forEach(input=>input.onchange=()=>{activity.value='';update()});
    activity.onchange=update;
    overlay.querySelector('[data-as-details]').onchange=update;
    async function load(){
      const token=++generation;loading=true;snapshot=null;currentReport=null;retry.hidden=true;error.textContent='';count.textContent='Chargement des inscriptions…';update();
      try {
        const data=await options.load(current);
        if(!current() || token!==generation)return;
        snapshot=createSnapshot(data);activity.replaceChildren(new Option('Toutes les activités',''));
        snapshot.activities.forEach(a=>activity.add(new Option(a.label,a.key)));activity.value='';
      } catch (_) {
        if(!current() || token!==generation)return;
        count.textContent='Liste non disponible pour le moment.';
        error.textContent='Les inscriptions n’ont pas pu être chargées. Réessayez avec une connexion ; vos données sont conservées.';retry.hidden=false;
      } finally {if(current() && token===generation){loading=false;update()}}
    }
    retry.onclick=load;
    download.onclick=()=>{
      if(!current()){close();return}
      if(loading || !currentReport?.rows.length)return;
      try {options.download(currentReport,overlay.querySelector('[name="asDownloadFormat"]:checked').value);close()}
      catch (_){error.textContent='Le fichier n’a pas pu être créé. Réessayez ; les inscriptions sont conservées.'}
    };
    update();overlay.querySelector('[data-as-close]').focus();void load();return overlay;
  }
  const api={createSnapshot,report,pdfCommands,wrap,open};root.EpsAsDownloads=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
