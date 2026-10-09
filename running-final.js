/* Bilan des séances enregistrées, partagé par le site et la PWA. */
(function(root) {
  const modes = { mean: 'Moyenne des tests', best: 'Meilleure note', progress: 'Moyenne + progression' };
  const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
  function calculate(samples, mode, cap = 1, malus = false) {
    const valid = samples.filter(s => Number.isFinite(s.score) && s.score >= 0 && s.score <= 12 && Number.isFinite(s.date)).sort((a,b) => a.date-b.date);
    if (!valid.length) return { count:0, mean:null, delta:null, adjustment:0, score:null };
    const mean = valid.reduce((n,s) => n+s.score,0)/valid.length;
    const delta = valid.length > 1 ? valid.at(-1).score-valid[0].score : null;
    const adjustment = mode === 'progress' && delta !== null ? Math.max(malus ? -cap : 0, Math.min(cap,delta)) : 0;
    return { count:valid.length, mean:round(mean), delta:delta === null ? null : round(delta), adjustment:round(adjustment), score:round(Math.max(0,Math.min(12,mode === 'best' ? Math.max(...valid.map(s=>s.score)) : mean+adjustment))) };
  }
  function sample(row, saved) {
    if (row.deleted || row.result_value == null || row.result_value === '' || String(row.result_unit).trim() !== '/12') return null;
    const unit = String(row.input_unit || '');
    if (!unit.startsWith('runs:500:3:')) return null;
    const times = unit.split(':times:')[1]?.split('|') || [];
    if (times.length !== 3 || times.some(t=>!/^\d{1,3}$/.test(t) || +t <= 0 || +t%100 >= 60)) return null;
    const score = Number(row.result_value), date = Number(saved.created_at) || Date.parse(saved.created_at);
    if (!Number.isFinite(score) || score < 0 || score > 12 || !Number.isFinite(date)) return null;
    return { score,date,signature:`${unit.match(/:difficulty:([^:]+)/)?.[1] || '0'}:${unit.includes(':mode:walk:')?'walk':'run'}` };
  }
  root.RunningFinal = { calculate, sample };
  if (typeof module !== 'undefined') module.exports = root.RunningFinal;
  if (typeof document === 'undefined') return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function read(table, query, filter) {
    if (modeHorsConnexion) return (await modeHorsConnexion.lire(table,{ou:r=>!r.deleted && filter(r)})).rows;
    const response = await apiFetch(`${SUPABASE_URL}/rest/v1/${table}?deleted=eq.false&${query}&select=*`);
    if (!response.ok) throw Error('Impossible de charger les résultats. Réessayez.');
    return response.json();
  }
  async function write(table,row) {
    if (modeHorsConnexion) return modeHorsConnexion.enregistrer(table,row.id,row);
    const response = await apiFetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=id`,{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(row)});
    if (!response.ok) throw Error('Enregistrement interrompu. Vous pouvez réessayer sans créer de doublon.');
  }
  root.openRunningFinal = async function() {
    const classId = toolClassId, period = epsTestPeriod, students = [...toolStudents];
    const dialog = document.createElement('dialog');
    dialog.style.cssText='width:min(1050px,94vw);max-height:90dvh;overflow:auto;border:1px solid #bdd8eb;border-radius:20px;padding:20px;color:#163b55';
    dialog.innerHTML='<h2>Calculer une note finale · 3 × 500 m</h2><p>Chargement…</p><button data-close>Fermer</button>';
    document.body.append(dialog);dialog.showModal();
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();
    try {
      const sessions = await read('eps_test_sessions',`class_id=eq.${classId}&period_number=eq.${period}&test_name=eq.${encodeURIComponent('3 × 500 m')}`,s=>String(s.class_id)===String(classId)&&+s.period_number===+period&&s.test_name==='3 × 500 m');
      sessions.sort((a,b)=>(Number(a.created_at)||Date.parse(a.created_at))-(Number(b.created_at)||Date.parse(b.created_at)));
      const results = (await Promise.all(sessions.map(s=>read('eps_test_results',`session_id=eq.${s.id}`,r=>String(r.session_id)===String(s.id))))).flat();
      const cycles = await read('cycles',`class_id=eq.${classId}`,c=>String(c.class_id)===String(classId));
      const evaluations = cycles.length ? await read('evaluations',`cycle_id=in.(${cycles.map(c=>c.id).join(',')})&type=eq.FINALE`,e=>cycles.some(c=>c.id===e.cycle_id)&&e.type==='FINALE') : [];
      const selected = new Set(sessions.map(s=>s.id));
      let mode='mean', cap=1, malus=false, cycleId=cycles[0]?.id || '', target='', busy=false, plan=null;
      const edits = new Map();
      function preview() {
        return students.map(student=>{
          const samples = sessions.filter(s=>selected.has(s.id)).flatMap(s=>{
            const r=results.find(r=>String(r.session_id)===String(s.id)&&String(r.student_id)===String(student.id));
            const value=r && sample(r,s);return value?[value]:[];
          });
          const incompatible = new Set(samples.map(s=>s.signature)).size>1;
          return { student, incompatible, ...calculate(samples,mode,cap,malus) };
        });
      }
      function paint(message='') {
        const rows=preview(), finals=evaluations.filter(e=>e.cycle_id===cycleId);
        if (!finals.some(e=>e.id===target)) target=finals[0]?.id || '';
        const incompatible=rows.some(r=>r.incompatible);
        dialog.innerHTML=`<h2>Calculer une note finale · 3 × 500 m</h2><p>Période ${period} · séances enregistrées uniquement. Enregistrez vos derniers temps avant d’ouvrir ce bilan.</p>
          <details open><summary>1. Sélectionner les tests (${selected.size})</summary><button data-all class="secondary">Tout sélectionner</button> <button data-none class="secondary">Tout décocher</button><div style="max-height:170px;overflow:auto">${sessions.map(s=>`<label style="display:block"><input style="width:auto" type="checkbox" data-session="${esc(s.id)}" ${selected.has(s.id)?'checked':''}> ${esc(new Date(Number(s.created_at)||s.created_at).toLocaleString('fr-FR'))}</label>`).join('') || '<p>Aucune séance enregistrée.</p>'}</div></details>
          <label>2. Méthode<select data-mode>${Object.entries(modes).map(([k,v])=>`<option value="${k}" ${mode===k?'selected':''}>${v}</option>`).join('')}</select></label>
          ${mode==='progress'?`<label>Ajustement maximal (points sur 12)<input data-cap type="number" min="0" max="12" step="0.25" value="${cap}"></label><label><input style="width:auto" data-malus type="checkbox" ${malus?'checked':''}> Autoriser aussi un malus en cas de baisse</label><p>Évolution = dernière note − première note. L’ajustement est limité à ${cap} point(s). La moyenne est ensuite ajustée et la note plafonnée entre 0 et 12. Avec un seul test : aucun ajustement.</p>`:''}
          <p>Les absences, tests incomplets et formats autres que 3 × 500 m sur 12 sont ignorés. Une case vide ne vaut pas zéro.</p>
          ${incompatible?'<p role="alert">Certaines séances utilisent des difficultés ou des modes course/marche différents pour un même élève. Décochez les séances concernées avant de valider.</p>':''}
          <div style="overflow:auto"><table style="width:100%;min-width:650px"><thead><tr><th>Élève</th><th>Tests</th><th>Moyenne /12</th><th>Évolution</th><th>Ajustement</th><th>Note finale /12</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${esc(studentLabel(r.student))}${r.incompatible?' ⚠':''}</td><td>${r.count}/${selected.size}</td><td>${r.mean??'—'}</td><td>${r.delta??'—'}</td><td>${r.adjustment}</td><td><input style="width:85px" type="number" min="0" max="12" step="0.01" data-score="${i}" value="${esc(edits.get(String(r.student.id))??r.score??'')}" ${r.score===null?'disabled':''}></td></tr>`).join('')}</tbody></table></div>
          <label>3. Cycle de destination<select data-cycle>${cycles.map(c=>`<option value="${esc(c.id)}" ${c.id===cycleId?'selected':''}>${esc(c.apsa_name||c.label||'Cycle')} ${esc(c.priority_objective||'')}</option>`).join('')}</select></label>
          ${finals.length?`<label>Évaluation finale<select data-target>${finals.map(e=>`<option value="${esc(e.id)}" ${target===e.id?'selected':''}>${esc(e.label)}</option>`).join('')}</select></label>`:'<p>Une évaluation finale sera créée dans ce cycle.</p>'}
          <p>Une nouvelle colonne « Bilan 3 × 500 m /12 » sera ajoutée. Vérifiez les notes proposées avant de valider.</p>
          ${!cycles.length?'<p>Créez d’abord le cycle de cette classe dans Cours.</p>':''}<p role="status">${esc(message)}</p><button data-save ${busy||!cycleId||incompatible||!rows.some(r=>r.count)?'disabled':''}>Ajouter à l’évaluation finale</button> <button data-close class="secondary" ${busy?'disabled':''}>Fermer</button>`;
        dialog.querySelector('[data-close]').onclick=()=>dialog.close();
        const reset=()=>{edits.clear();plan=null;paint()};
        dialog.querySelector('[data-all]').onclick=()=>{sessions.forEach(s=>selected.add(s.id));reset()};
        dialog.querySelector('[data-none]').onclick=()=>{selected.clear();reset()};
        dialog.querySelectorAll('[data-session]').forEach(b=>b.onchange=()=>{b.checked?selected.add(b.dataset.session):selected.delete(b.dataset.session);reset()});
        dialog.querySelector('[data-mode]').onchange=e=>{mode=e.target.value;reset()};
        dialog.querySelector('[data-cap]')?.addEventListener('change',e=>{cap=Math.max(0,Math.min(12,Number(e.target.value)||0));reset()});
        dialog.querySelector('[data-malus]')?.addEventListener('change',e=>{malus=e.target.checked;reset()});
        dialog.querySelector('[data-cycle]').onchange=e=>{cycleId=e.target.value;plan=null;paint()};
        dialog.querySelector('[data-target]')?.addEventListener('change',e=>{target=e.target.value;plan=null});
        dialog.querySelectorAll('[data-score]').forEach(input=>input.oninput=()=>{edits.set(String(rows[+input.dataset.score].student.id),input.value);plan=null});
        dialog.querySelector('[data-save]').onclick=async()=>{
          if(busy)return;
          const notes=rows.filter(r=>r.count).map(r=>({studentId:r.student.id,value:edits.get(String(r.student.id))??String(r.score)}));
          if(notes.some(n=>n.value.trim()===''||!Number.isFinite(Number(n.value))||Number(n.value)<0||Number(n.value)>12)){paint('Toutes les notes doivent être comprises entre 0 et 12.');return}
          busy=true;
          if(!plan){
            const now=new Date().toISOString(),evaluationId=target||crypto.randomUUID(),criterionId=crypto.randomUUID();
            const dates=sessions.filter(s=>selected.has(s.id)).map(s=>new Date(Number(s.created_at)||s.created_at).toLocaleDateString('fr-FR')).join(', ');
            const label=`Bilan 3 × 500 m — ${modes[mode]}${mode==='progress'?` (plafond ${cap}, ${malus?'bonus/malus':'bonus seul'})`:''} — ${dates}`;
            plan={evaluation:target?null:{id:evaluationId,user_id:session.user_id,cycle_id:cycleId,type:'FINALE',label:'Évaluation finale · 3 × 500 m',date_epoch_millis:Date.now(),updated_at:now,deleted:false},criterion:{id:criterionId,user_id:session.user_id,evaluation_id:evaluationId,label,max_points:12,order_index:100,updated_at:now,deleted:false},scores:notes.map(n=>({id:crypto.randomUUID(),user_id:session.user_id,criterion_id:criterionId,student_id:n.studentId,points:Number(n.value),updated_at:now,deleted:false}))};
          }
          paint('Enregistrement…');
          dialog.querySelectorAll('input,select,button').forEach(e=>e.disabled=true);
          try{if(plan.evaluation)await write('evaluations',plan.evaluation);await write('evaluation_criteria',plan.criterion);for(const score of plan.scores)await write('evaluation_scores',score);dialog.innerHTML='<h2>Bilan ajouté à l’évaluation finale</h2><p>Retrouvez la colonne sur 12 dans les évaluations du cycle choisi. Les dates des tests et la méthode figurent dans son intitulé.</p><button data-close>Fermer</button>';dialog.querySelector('[data-close]').onclick=()=>dialog.close();}
          catch(e){busy=false;paint(e.message)}
        };
      }
      paint();
    } catch(e) { dialog.querySelector('p').textContent=e.message; }
  };
})(globalThis);
