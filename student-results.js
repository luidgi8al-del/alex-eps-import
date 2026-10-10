/* A real zero is valid; a placeholder marked draft is never a completed result. */
(function () {
  const complete = r => !r.deleted && !/brouillon|incomplet|à compléter|non renseigné|en cours/i.test(r.result_unit || '') && r.result_value != null && r.result_value !== '' && Number.isFinite(Number(r.result_value)) &&
    (!String(r.input_unit||'').startsWith('sprint:') || ['sprint','palier','saut'].every(key=>new RegExp('(?:^|\\|)'+key+':([^|]+)').test(r.input_unit)));
  function series(rows, sessions) {
    const groups = new Map();
    for(const r of rows.filter(r=>!r.deleted && String(r.input_unit||'').startsWith('sprint:'))) {
      const s=sessions.find(s=>String(s.id)===String(r.session_id));if(!s)continue;
      for(const [key,label,unit] of [['sprint','Sprint 30 m','s'],['palier','Endurance','palier'],['saut','Saut sans élan','cm']]) {
        const raw=String(r.input_unit).match(new RegExp('(?:^|\\|)'+key+':([^|]+)'))?.[1];if(raw==null)continue;
        const value=Number(raw.replace(',','.'));if(!Number.isFinite(value))continue;
        const id=JSON.stringify(['aptitudes6',key]),g=groups.get(id)||{label,unit,points:[]};
        g.points.push({date:Number(s.created_at)||Date.parse(s.created_at),value});groups.set(id,g);
      }
    }
    for (const r of rows.filter(complete)) {
      const s = sessions.find(s => String(s.id) === String(r.session_id));
      if (!s) continue;
      if(String(r.input_unit||'').startsWith('sprint:'))continue;
      // Include protocol metadata: different units or test formats must not be compared.
      const input = String(r.input_unit || '').replace(/^group:\d+\|(?:groups:\d+\|)?/, '').split('|workflow:')[0];
      const running = input.match(/^runs:(\d+):(\d+):/);
      const raw = !!running || /^(s|sec|secondes|m|cm|km\/h|palier|distance \(m\)|temps.*|distance.*)$/i.test(input);
      const unit = running ? 's (moyenne des courses)' : raw ? input : r.result_unit;
      const protocol = running ? `${running[1]}m × ${running[2]} · difficulté ${input.match(/:difficulty:([^:]+)/)?.[1]||'0'} · ${input.includes(':mode:walk:')?'marche':'course'}` : s.test_name;
      const key = JSON.stringify([s.test_name, protocol, unit]);
      const g = groups.get(key) || {label: running ? protocol : s.test_name, unit, points: []};
      g.points.push({date: Number(s.created_at) || Date.parse(s.created_at), value: Number(raw ? r.input_value : r.result_value)});
      groups.set(key, g);
    }
    return [...groups.values()].map(g => ({...g, points: g.points.filter(p => Number.isFinite(p.value) && Number.isFinite(p.date)).sort((a,b) => a.date-b.date)})).filter(g => g.points.length >= 2);
  }
  function evaluationSeries(evaluations,cycles) {
    const groups=new Map();
    evaluations.forEach(e=>e.criteres.forEach(c=>{
      const n=e.notes.find(n=>n.criterion_id===c.id);if(!n||!Number.isFinite(Number(n.points)))return;
      const activity=cycles.find(x=>String(x.id)===String(e.cycle_id))?.apsa_name||String(e.cycle_id||'Activité');
      const key=JSON.stringify([activity,c.label,c.max_points]),g=groups.get(key)||{label:`${activity} · ${c.label}`,unit:`/${c.max_points}`,points:[]};
      g.points.push({date:Number(e.date_epoch_millis)||0,value:Number(n.points)});groups.set(key,g);
    }));return [...groups.values()].map(g=>({...g,points:g.points.sort((a,b)=>a.date-b.date)})).filter(g=>g.points.length>=2);
  }
  function html(rows, sessions, escape, evaluations=[],cycles=[]) {
    const all = [...series(rows, sessions),...evaluationSeries(evaluations,cycles)];
    return '<article class="student-progress-card"><h3>Progression par épreuve</h3><p class="muted">Même épreuve et même unité, du plus ancien au plus récent. Les brouillons sont exclus. Une baisse du temps peut être un progrès.</p>' + (all.map(g => {
      const values = g.points.map(p => p.value), min = Math.min(...values), span = Math.max(...values)-min || 1;
      const coords = values.map((v,i) => `${10+i*280/(values.length-1)},${85-(v-min)/span*65}`).join(' ');
      const delta = values.at(-1)-values[0];
      return `<h4>${escape(g.label)} · ${escape(g.unit)}</h4><svg role="img" aria-label="Progression ${escape(g.label)}" viewBox="0 0 300 100" style="width:100%;max-width:500px;height:130px"><polyline points="${coords}" fill="none" stroke="#087dca" stroke-width="3"/></svg><p>${escape(values.join(' → '))} ${escape(g.unit)} · écart ${delta >= 0 ? '+' : ''}${Number(delta.toFixed(2))}</p>`;
    }).join('') || '<p>Deux résultats comparables sont nécessaires.</p>') + '</article>';
  }
  globalThis.EpsStudentResults = {complete, series, html, evaluationSeries};
  if (typeof module !== 'undefined') module.exports = EpsStudentResults;
})();
