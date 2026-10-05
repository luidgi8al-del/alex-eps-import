/* Une même grille pour les équipes ouvertes depuis Outils ou depuis la classe. */
(function () {
  const esc = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const name = s => `${s.last_name || ''} ${s.first_name || ''}`.trim();
  const letter = i => i < 26 ? String.fromCharCode(65 + i) : String(i + 1);
  const cacheKey=()=> 'eps:team-evaluations:'+SUPABASE_URL+':'+session.user_id;
  const cached=()=>JSON.parse(localStorage.getItem(cacheKey())||'{}');
  function keep(record,pending=true,sendable=true){const all=cached();all[record.id]={record:structuredClone(record),pending,sendable};localStorage.setItem(cacheKey(),JSON.stringify(all));}
  let sending=null;
  async function flush(){
    if(sending)return sending;
    const owner=session?.user_id;if(!owner||navigator.onLine===false)return;
    sending=(async()=>{
      for(const item of Object.values(cached()).filter(x=>x.pending&&x.sendable!==false)){
        if(session?.user_id!==owner)return;
        const r=await apiFetch(SUPABASE_URL+'/rest/v1/team_evaluations',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(item.record)});
        if(!r.ok)throw Error('Envoi non confirmé par le serveur.');
        if(session?.user_id!==owner)return;
        const current=cached()[item.record.id];
        if(current && JSON.stringify(current.record)===JSON.stringify(item.record))keep(item.record,false);
      }
    })().finally(()=>{sending=null;});
    return sending;
  }
  addEventListener('online',()=>flush().catch(()=>{}));
  setInterval(()=>{if(typeof session!=='undefined'&&session?.user_id)flush().catch(()=>{});},15000);
  async function rows(table, query) {
    const local=table==='team_evaluations'?Object.values(cached()).map(x=>x.record).filter(r=>!r.deleted&&[...new URLSearchParams(query)].every(([k,v])=>!v.startsWith('eq.')||String(r[k])===v.slice(3))):[];
    try{
      const response=await apiFetch(SUPABASE_URL+'/rest/v1/'+table+'?'+query+'&deleted=eq.false');
      if(!response.ok)throw Error('Impossible de charger les évaluations.');
      const remote=await response.json(),byId=new Map(remote.map(r=>[r.id,r]));
      for(const r of local)if(cached()[r.id]?.pending)byId.set(r.id,r);
      return [...byId.values()];
    }catch(error){if(local.length)return local;throw error;}
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  // Petit classeur OOXML, sans dépendance réseau : archives ZIP non compressées.
  function excel(data) {
    const enc = new TextEncoder(), files = {
      '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Évaluation équipes" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml':'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+data.map((r,i)=>`<row r="${i+1}">${r.map(v=>typeof v==='number'?`<c><v>${v}</v></c>`:`<c t="inlineStr"><is><t xml:space="preserve">${esc(v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'')}</t></is></c>`).join('')}</row>`).join('')+'</sheetData></worksheet>'
    }, parts=[], central=[];
    let offset=0;
    const header=(size,values)=>{const b=new Uint8Array(size),v=new DataView(b.buffer);values.forEach(([p,n,w])=>w===2?v.setUint16(p,n,true):v.setUint32(p,n,true));return b;};
    for(const [path,xml] of Object.entries(files)) {
      const n=enc.encode(path),b=enc.encode('<?xml version="1.0" encoding="UTF-8"?>'+xml);let crc=0xffffffff;
      for(const x of b){crc^=x;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
      parts.push(header(30,[[0,0x04034b50],[4,20,2],[14,crc],[18,b.length],[22,b.length],[26,n.length,2]]),n,b);
      central.push(header(46,[[0,0x02014b50],[4,20,2],[6,20,2],[16,crc],[20,b.length],[24,b.length],[28,n.length,2],[42,offset]]),n);
      offset+=30+n.length+b.length;
    }
    const size=central.reduce((s,b)=>s+b.length,0),count=Object.keys(files).length;
    return new Blob([...parts,...central,header(22,[[0,0x06054b50],[8,count,2],[10,count,2],[12,size],[16,offset]])],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  function editor(host, composition, groups, existing, back) {
    const drafts=Object.values(cached()).filter(x=>x.pending&&x.record.saved_team_id===composition.id);
    if(existing && cached()[existing.id]?.pending)existing=cached()[existing.id].record;
    else if(!existing&&drafts.length&&confirm('Reprendre l’évaluation conservée sur cet appareil ?'))existing=drafts.at(-1).record;
    const date=existing?.created_at||new Date().toISOString(),id=existing?.id||crypto.randomUUID();
    const snapshot=Array.from(existing?.scores_json?._meta?.groups||groups,g=>g||[]);
    let criteria=structuredClone(existing?.criteria_json?.length?existing.criteria_json:[{id:crypto.randomUUID(),name:'Technique',max:5}]);
    const common=structuredClone(existing?.scores_json||{});delete common._meta;
    const individual=structuredClone(existing?.scores_json?._meta?.individualScores||{});
    let title=existing?.title||'Évaluation · '+composition.name,period=Number(existing?.scores_json?._meta?.period||composition.period_number||1),active=null,timer;
    const value=(student,i,c)=>Object.hasOwn(individual[student.id]||{},c.id)?individual[student.id][c.id]:(common[i]?.[c.id]??'');
    const total=(student,i)=>criteria.every(c=>value(student,i,c)!=='')?criteria.reduce((sum,c)=>sum+Number(value(student,i,c)),0):null;
    const status=message=>{const el=host.querySelector('#teStatus');if(el)el.textContent=message;};
    const record=()=>({id,user_id:session.user_id,saved_team_id:composition.id,class_id:composition.class_id,title:title.trim(),criteria_json:structuredClone(criteria),scores_json:{...structuredClone(common),_meta:{version:2,groups:structuredClone(snapshot),individualScores:structuredClone(individual),period,compositionName:composition.name}},created_at:date,updated_at:new Date().toISOString(),deleted:false});
    function validate(){
      if(!title.trim()||!criteria.length||criteria.some(c=>!c.name.trim()||!Number.isFinite(c.max)||c.max<=0))throw Error('Complétez le nom et les barèmes positifs.');
      snapshot.forEach((g,i)=>g.forEach(s=>criteria.forEach(c=>{const v=value(s,i,c);if(v!==''&&(!Number.isFinite(+v)||+v<0||+v>c.max))throw Error(name(s)+' : note entre 0 et '+c.max+'.');})));
    }
    async function send(){
      try{validate();await flush();status(cached()[id]?.pending?'Sauvegardé sur cet appareil — synchronisation en attente.':'Enregistré en ligne.');}
      catch(e){status('Sauvegardé sur cet appareil — '+e.message);}
    }
    function save(){
      try{let valid=true;try{validate();}catch{valid=false;}keep(record(),true,valid);status('Sauvegardé sur cet appareil — synchronisation en attente.');clearTimeout(timer);timer=setTimeout(send,500);return true;}
      catch(e){status('Sauvegarde impossible sur cet appareil. Ne fermez pas cette page.');return false;}
    }
    function closeGroup(){if(save()){active=null;draw();status('Sauvegardé sur cet appareil — vérification de l’envoi…');}}
    const data=()=>[[title],['Date',new Date(date).toLocaleDateString('fr-FR'),'Période',period],['Équipe','Élève',...criteria.map(c=>c.name+' / '+c.max),'Total'],...snapshot.flatMap((g,i)=>g.map(s=>['Équipe '+letter(i),name(s),...criteria.map(c=>value(s,i,c)===''?'':Number(value(s,i,c))),total(s,i)??'Incomplet']))];
    function draw(){
      host.innerHTML='<section class="card"><h2>Évaluation par équipes</h2><p>'+esc(composition.name)+' · '+snapshot.length+' équipes · '+snapshot.flat().length+' élèves</p><div id="teSettings"></div><div id="teTeams"></div><div class="team-eval-actions"><button id="teSave">Enregistrer maintenant</button><button id="teExcel" class="secondary">Excel (.xlsx)</button><button id="tePdf" class="secondary">PDF / Imprimer</button><button id="teBack" class="secondary">Fermer l’évaluation</button></div><p id="teStatus" role="status"></p></section>';
      const settings=host.querySelector('#teSettings');
      settings.hidden=active!==null;
      settings.innerHTML='<label>Nom de l’évaluation<input id="teTitle" value="'+esc(title)+'"></label><label>Période<select id="tePeriod">'+Array.from({length:Math.max(6,period)},(_,i)=>'<option value="'+(i+1)+'" '+(period===i+1?'selected':'')+'>Période '+(i+1)+'</option>').join('')+'</select></label>'+criteria.map((c,i)=>'<div class="team-criterion-row"><label>Critère<input data-name="'+i+'" value="'+esc(c.name)+'"></label><label>Sur<input data-max="'+i+'" type="number" min=".01" step="any" value="'+c.max+'"></label><button data-remove="'+i+'" class="secondary">×</button></div>').join('')+'<button id="teAdd" class="secondary">＋ Ajouter un critère</button>';
      host.querySelector('#teTitle').oninput=e=>{title=e.target.value;save();};
      host.querySelector('#tePeriod').onchange=e=>{period=+e.target.value;save();};
      host.querySelectorAll('[data-name]').forEach(e=>e.oninput=()=>{criteria[+e.dataset.name].name=e.value;save();});
      host.querySelectorAll('[data-max]').forEach(e=>e.oninput=()=>{criteria[+e.dataset.max].max=+e.value;save();});
      host.querySelectorAll('[data-remove]').forEach(e=>e.onclick=()=>{if(!confirm('Supprimer ce critère de cette évaluation ?'))return;criteria.splice(+e.dataset.remove,1);save();draw();});
      host.querySelector('#teAdd').onclick=()=>{criteria.push({id:crypto.randomUUID(),name:'Nouveau critère',max:5});save();draw();};
      const teamHost=host.querySelector('#teTeams');
      if(active===null){
        teamHost.innerHTML='<p>Ouvrez une équipe pour noter individuellement ses élèves. Les saisies sont sauvegardées automatiquement.</p><div class="saved-team-grid">'+snapshot.map((g,i)=>'<button class="saved-team-card" data-open-individual="'+i+'"><b>Équipe '+letter(i)+'</b><p>'+g.map(s=>esc(name(s))).join(' · ')+'</p><small>'+g.filter(s=>total(s,i)!==null).length+' / '+g.length+' évalués</small></button>').join('')+'</div>';
        teamHost.querySelectorAll('[data-open-individual]').forEach(b=>b.onclick=()=>{active=+b.dataset.openIndividual;draw();});
      }else{
        const i=active,g=snapshot[i];
        teamHost.innerHTML='<div style="display:flex;justify-content:space-between"><h3>Équipe '+letter(i)+'</h3><button id="teCloseGroup" aria-label="Fermer cette équipe">×</button></div><p>Note individuelle : chaque élève peut avoir une note différente.</p>'+g.map(s=>'<article class="card"><h4>'+esc(name(s))+'</h4>'+criteria.map(c=>'<label>'+esc(c.name)+' / '+c.max+'<input type="number" step="any" min="0" max="'+c.max+'" data-student-score="'+esc(s.id)+'" data-criterion="'+c.id+'" value="'+esc(value(s,i,c))+'"></label>').join('')+'</article>').join('')+'<details><summary>Appliquer une note commune à l’équipe</summary>'+criteria.map(c=>'<label>'+esc(c.name)+' / '+c.max+'<input type="number" step="any" data-common="'+c.id+'"></label>').join('')+'<button id="teApplyCommon">Appliquer aux membres</button></details>';
        teamHost.querySelector('#teCloseGroup').onclick=closeGroup;
        teamHost.querySelectorAll('[data-student-score]').forEach(e=>e.oninput=()=>{(individual[e.dataset.studentScore]??={})[e.dataset.criterion]=e.value;save();});
        teamHost.querySelector('#teApplyCommon').onclick=()=>{
          const inputs=[...teamHost.querySelectorAll('[data-common]')].filter(e=>e.value!=='');
          if(inputs.some(e=>!Number.isFinite(+e.value)||+e.value<0||+e.value>criteria.find(c=>c.id===e.dataset.common).max)){status('Note commune hors barème.');return;}
          if(!inputs.length||!confirm('Appliquer ces notes à tous les membres ? Les notes déjà saisies pour ces critères seront remplacées.'))return;
          for(const s of g)for(const e of inputs)(individual[s.id]??={})[e.dataset.common]=e.value;
          save();draw();
        };
      }
      host.querySelector('#teSave').onclick=()=>{if(save()){clearTimeout(timer);send();}};
      host.querySelector('#teBack').onclick=()=>{if(save()){clearTimeout(timer);send();back();}};
      host.querySelector('#teExcel').onclick=()=>{try{validate();download(excel(data()),title.replace(/[\\/:*?"<>|]/g,'-')+'.xlsx');}catch(e){status(e.message);}};
      host.querySelector('#tePdf').onclick=()=>{try{validate();const w=window.open('','_blank');if(!w)throw Error('Autorisez la fenêtre d’impression.');w.document.write('<html><head><title>'+esc(title)+'</title><style>body{font-family:Arial}table{border-collapse:collapse;width:100%}td{border:1px solid #999;padding:8px}tr{break-inside:avoid}</style></head><body><h1>'+esc(title)+'</h1><table>'+data().slice(1).map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</table></body></html>');w.document.close();w.focus();w.print();}catch(e){status(e.message);}};
    }
    draw();
  }
  function isComplete(e){const m=e.scores_json?._meta;return !!m?.groups?.length&&!!e.criteria_json?.length&&m.groups.every((g,i)=>g.every(s=>e.criteria_json.every(c=>{const v=Object.hasOwn(m.individualScores?.[s.id]||{},c.id)?m.individualScores[s.id][c.id]:e.scores_json[i]?.[c.id];return v!==undefined&&v!=='';})));}
  globalThis.TeamEvaluation={editor,rows,isComplete};
})();
