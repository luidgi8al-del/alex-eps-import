/* Une même grille pour les équipes ouvertes depuis Outils ou depuis la classe. */
(function () {
  const esc = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const name = s => `${s.last_name || ''} ${s.first_name || ''}`.trim();
  const letter = i => i < 26 ? String.fromCharCode(65 + i) : String(i + 1);
  async function rows(table, query) {
    const r = await apiFetch(`${SUPABASE_URL}/rest/v1/${table}?${query}&deleted=eq.false`);
    if (!r.ok) throw Error('Impossible de charger les évaluations.');
    return r.json();
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
    const date=existing?.created_at || new Date().toISOString(),id=existing?.id || crypto.randomUUID();
    const snapshot=structuredClone(existing?.scores_json?._meta?.groups || groups);
    let criteria=structuredClone(existing?.criteria_json?.length?existing.criteria_json:[{id:crypto.randomUUID(),name:'Technique',max:5}]);
    const scores=structuredClone(existing?.scores_json || {});delete scores._meta;
    let title=existing?.title || `Évaluation · ${composition.name}`,busy=false,period=Number(existing?.scores_json?._meta?.period || composition.period_number || 1);
    const total=i=>criteria.every(c=>scores[i]?.[c.id]!==undefined && scores[i][c.id]!=='')?criteria.reduce((s,c)=>s+Number(scores[i][c.id]),0):null;
    const collect=()=>{
      title=host.querySelector('#teTitle').value;
      period=Number(host.querySelector('#tePeriod').value);
      host.querySelectorAll('[data-name]').forEach(e=>criteria[+e.dataset.name].name=e.value);
      host.querySelectorAll('[data-max]').forEach(e=>criteria[+e.dataset.max].max=Number(e.value));
      host.querySelectorAll('[data-team-score]').forEach(e=>(scores[e.dataset.teamScore]??={})[e.dataset.criterion]=e.value);
    };
    const validate=()=>{
      if(!title.trim() || !criteria.length || criteria.some(c=>!c.name.trim() || !Number.isFinite(c.max) || c.max<=0))throw Error('Renseignez le nom, au moins un critère et un barème positif.');
      snapshot.forEach((g,i)=>criteria.forEach(c=>{const v=scores[i]?.[c.id];if(v!==undefined && v!=='' && (!Number.isFinite(+v)||+v<0||+v>c.max))throw Error(`Équipe ${letter(i)} : la note « ${c.name} » doit être entre 0 et ${c.max}.`);}));
    };
    const data=()=>[[title],['Date',new Date(date).toLocaleDateString('fr-FR'),'Période',period,'Composition',composition.name],['Équipe','Élèves',...criteria.map(c=>`${c.name} / ${c.max}`),`Total / ${criteria.reduce((s,c)=>s+c.max,0)}`],...snapshot.map((g,i)=>[`Équipe ${letter(i)}`,g.map(name).join(' · '),...criteria.map(c=>scores[i]?.[c.id]===undefined||scores[i][c.id]===''?'':Number(scores[i][c.id])),total(i)??'Incomplet'])];
    function draw() {
      host.innerHTML=`<section class="card"><h2>Évaluation par équipes</h2><p>${esc(composition.name)} · ${new Date(date).toLocaleDateString('fr-FR')} · rangée dans Classe → Évaluations / Tests</p><label>Nom de l’évaluation<input id="teTitle" value="${esc(title)}"></label><label>Période<select id="tePeriod">${Array.from({length:Math.max(6,period)},(_,i)=>`<option value="${i+1}"${period===i+1?' selected':''}>Période ${i+1}</option>`).join('')}</select></label><p>Une note commune aux élèves de chaque équipe. Une case vide reste « non évaluée ».</p><div>${criteria.map((c,i)=>`<div class="team-criterion-row"><label>Critère<input data-name="${i}" value="${esc(c.name)}"></label><label>Sur<input data-max="${i}" type="number" min="0.01" step="any" value="${c.max}"></label><button data-remove="${i}" class="secondary" aria-label="Supprimer le critère ${i+1}">×</button></div>`).join('')}</div><button id="teAdd" class="secondary">＋ Ajouter un critère</button><div style="overflow:auto;max-width:100%;margin:20px 0"><table style="border-collapse:collapse;width:100%;min-width:600px"><thead><tr><th>Équipe et élèves</th>${criteria.map(c=>`<th>${esc(c.name)}<br>/${c.max}</th>`).join('')}<th>Total / ${criteria.reduce((s,c)=>s+c.max,0)}</th></tr></thead><tbody>${snapshot.map((g,i)=>`<tr><th style="min-width:190px;text-align:left;padding:12px;position:sticky;left:0;background:white">Équipe ${letter(i)}<small style="display:block;font-weight:normal">${g.map(s=>esc(name(s))).join('<br>')}</small></th>${criteria.map(c=>`<td style="padding:8px;min-width:100px"><input aria-label="Équipe ${letter(i)}, ${esc(c.name)}" data-team-score="${i}" data-criterion="${c.id}" type="number" min="0" max="${c.max}" step="any" value="${esc(scores[i]?.[c.id]??'')}"></td>`).join('')}<td data-total="${i}">${total(i)??'Incomplet'}</td></tr>`).join('')}</tbody></table></div><div class="team-eval-actions"><button id="teSave">Enregistrer</button><button id="teExcel" class="secondary">Excel (.xlsx)</button><button id="tePdf" class="secondary">PDF / Imprimer</button><button id="teBack" class="secondary">Retour</button></div><p id="teStatus" role="status"></p></section>`;
      const status=message=>host.querySelector('#teStatus').textContent=message;
      host.querySelectorAll('[data-name],[data-max]').forEach(e=>e.oninput=()=>{
        collect(); const headings=host.querySelectorAll('thead th');
        criteria.forEach((c,i)=>{headings[i+1].textContent=`${c.name} / ${c.max}`;host.querySelectorAll(`[data-criterion="${c.id}"]`).forEach(input=>input.max=c.max);});
        headings[headings.length-1].textContent=`Total / ${criteria.reduce((s,c)=>s+c.max,0)}`;
      });
      host.querySelectorAll('[data-team-score]').forEach(e=>e.oninput=()=>{collect();host.querySelectorAll('[data-total]').forEach(t=>t.textContent=total(+t.dataset.total)??'Incomplet');});
      host.querySelectorAll('[data-remove]').forEach(e=>e.onclick=()=>{collect();criteria.splice(+e.dataset.remove,1);draw();});
      host.querySelector('#teAdd').onclick=()=>{collect();criteria.push({id:crypto.randomUUID(),name:'Nouveau critère',max:5});draw();};
      host.querySelector('#teBack').onclick=()=>{if(!busy && confirm('Revenir à la composition ? Les modifications non enregistrées seront perdues.'))back();};
      host.querySelector('#teSave').onclick=async()=>{
        if(busy)return;collect();try{validate();busy=true;host.querySelectorAll('button,input').forEach(e=>e.disabled=true);
          const record={id,user_id:session.user_id,saved_team_id:composition.id,class_id:composition.class_id,title:title.trim(),criteria_json:criteria,scores_json:{...scores,_meta:{version:1,groups:snapshot,period,compositionName:composition.name}},created_at:date,updated_at:new Date().toISOString(),deleted:false};
          const response=await apiFetch(`${SUPABASE_URL}/rest/v1/team_evaluations`,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(record)});
          if(!response.ok)throw Error('Enregistrement refusé. Vos saisies sont conservées ; réessayez.');
          status('Évaluation enregistrée. Vous pouvez la retrouver dans la classe, rubrique Évaluations / Tests.');
        }catch(e){status(e.message);}finally{busy=false;host.querySelectorAll('button,input').forEach(e=>e.disabled=false);}
      };
      host.querySelector('#teExcel').onclick=()=>{collect();try{validate();download(excel(data()),title.replace(/[\\/:*?"<>|]/g,'-')+'.xlsx');}catch(e){status(e.message);}};
      host.querySelector('#tePdf').onclick=()=>{collect();try{validate();const w=window.open('','_blank');if(!w)throw Error('Autorisez la fenêtre d’impression puis réessayez.');w.document.write(`<html><head><title>${esc(title)}</title><style>@page{size:landscape;margin:12mm}body{font-family:Arial}table{border-collapse:collapse;width:100%}td{border:1px solid #999;padding:8px}tr{break-inside:avoid}</style></head><body><h1>${esc(title)}</h1><p>Dans la fenêtre d’impression, choisissez « Enregistrer au format PDF ».</p><table>${data().slice(1).map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table></body></html>`);w.document.close();w.focus();w.print();}catch(e){status(e.message);}};
    }
    draw();
  }
  globalThis.TeamEvaluation={editor,rows};
})();
