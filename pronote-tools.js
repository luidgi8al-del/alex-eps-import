/* Local preview. No network or automatic grade writes. */
(() => {
 function build(o) {
  if(!o.classId||['free','__libre__'].includes(o.classId))throw Error('Choisissez une classe.');
  const rows=o.rows.map(({student,score,scale=20,complete=true})=>{const ready=complete&&score!=null&&Number.isFinite(score)&&Number.isFinite(scale)&&scale>0&&score>=0&&score<=scale;return {lastName:student.last_name||'',firstName:student.first_name||'',value:ready?String(Math.round(score/scale*2000)/100).replace('.',','):'',check:ready?`${score.toFixed(2)} / ${scale}${scale!==20?' → sur 20':''}`:'À compléter / non noté'};}).sort((a,b)=>(a.lastName+' '+a.firstName).localeCompare(b.lastName+' '+b.firstName,'fr'));
  if(!rows.some(r=>r.value!==''))throw Error('Aucune note complète à transférer. Les couleurs et performances seules ne sont pas des notes.');
  const date=new Date(o.date??Date.now());return {format:'eps-pronote-v1',className:o.className||'',title:o.title,date:Number.isNaN(date.getTime())?'':date.toLocaleDateString('fr-CA'),scale:20,coefficient:1,rows};
 }
 function open(o){let data;try{data=build(o);}catch(e){alert(e.message);return;}
  document.getElementById('pronote-tool-preview')?.remove();const d=document.createElement('dialog');d.id='pronote-tool-preview';d.style.cssText='max-width:850px;width:90vw;max-height:85vh;overflow:auto;border:1px solid #087dca;border-radius:20px;padding:24px;color:#163c54';
  d.innerHTML='<h2>Transfert PRONOTE · outil noté</h2><p data-info></p><p>Notes sur 20 : toute conversion est indiquée. Les résultats incomplets restent vides.</p><label>Objet <input data-title></label><label>Date <input data-date type="date"></label><table style="width:100%"><thead><tr><th>Élève</th><th>Calcul</th><th>Note /20</th></tr></thead><tbody></tbody></table><button data-copy>Préparer pour PRONOTE Internet</button><button data-close>Fermer</button><p data-status role="status"></p>';
  d.querySelector('[data-info]').textContent=data.className+' · '+data.title;d.querySelector('[data-title]').value=data.title;d.querySelector('[data-date]').value=data.date;
  for(const r of data.rows){const tr=document.createElement('tr');for(const value of [r.lastName+' '+r.firstName,r.check,r.value||'—']){const td=document.createElement('td');td.textContent=value;td.style.padding='8px';tr.append(td);}d.querySelector('tbody').append(tr);}
  d.querySelector('[data-close]').onclick=()=>d.close();d.onclose=()=>d.remove();
  d.querySelector('[data-copy]').onclick=async()=>{try{data.title=d.querySelector('[data-title]').value.trim();data.date=d.querySelector('[data-date]').value;if(!data.title||!data.date)throw Error('Renseignez le titre et la date.');await navigator.clipboard.writeText(JSON.stringify({...data,rows:data.rows.map(({check,...r})=>r)}));d.querySelector('[data-status]').textContent='Transfert copié. Collez-le dans l’extension sur PRONOTE. Aucune note envoyée à ce stade.';}catch(e){d.querySelector('[data-status]').textContent=e.message;}};document.body.append(d);d.showModal();
 }
 function attach(anchor,provider){if(!anchor)return;anchor.parentElement.querySelector('[data-pronote-tool]')?.remove();const b=document.createElement('button');b.dataset.pronoteTool='true';b.className='secondary';b.textContent='PRONOTE';b.type='button';b.onclick=()=>{try{open(provider());}catch(e){alert(e.message);}};anchor.after(b);}
 globalThis.EpsPronoteTools={build,open,attach};
})();
