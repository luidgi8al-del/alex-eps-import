/* Reuse the existing synchronized class compositions. Import always creates a session copy. */
(function () {
  async function list(classId) {
    return lireTable('saved_teams', `saved_teams?class_id=eq.${encodeURIComponent(classId)}&deleted=eq.false&select=*&order=created_at.desc`, {ou:r=>!r.deleted&&String(r.class_id)===String(classId)});
  }
  async function copy(id, students) {
    const members = await lireTable('saved_team_members',`saved_team_members?saved_team_id=eq.${encodeURIComponent(id)}&deleted=eq.false&select=*`,{ou:r=>!r.deleted&&String(r.saved_team_id)===String(id)});
    const available=new Set(students.map(s=>String(s.id))),indices=[...new Set(members.filter(m=>available.has(String(m.student_id))).map(m=>Number(m.team_index)))].sort((a,b)=>a-b);
    const assignments={}; members.forEach(m=>{if(available.has(String(m.student_id)))assignments[m.student_id]=String(indices.indexOf(Number(m.team_index))+1)});
    return {groups:indices.map((_,i)=>({id:String(i+1),name:`Groupe ${i+1}`})),assignments,activeGroup:''};
  }
  async function save(classId, name, groups, assignments) {
    const now=new Date().toISOString(),id=crypto.randomUUID();
    if(!groups.length || groups.some(g=>!Object.values(assignments).some(v=>String(v)===String(g.id))))throw Error('Ajoutez un élève dans chaque groupe avant de conserver la composition.');
    // Existing schema requires parent first; tombstone a failed save rather than present it as complete.
    await enregistrerLigne('saved_teams',{id,user_id:session.user_id,class_id:classId,name,mode:'ALEATOIRE',created_at:now,updated_at:now,deleted:false});
    try {
      for(const [student,group] of Object.entries(assignments)) {
        const index=groups.findIndex(g=>String(g.id)===String(group)); if(index<0)continue;
        await enregistrerLigne('saved_team_members',{id:crypto.randomUUID(),user_id:session.user_id,saved_team_id:id,student_id:student,team_index:index,updated_at:now,deleted:false});
      }
    } catch(error) { await enregistrerLigne('saved_teams',{id,user_id:session.user_id,class_id:classId,name,mode:'ALEATOIRE',created_at:now,updated_at:now,deleted:true}); throw error; }
    return id;
  }
  function controls(state) {return state.classId?'<div class="field-tool-row"><button type="button" id="wfClassGroups" class="secondary">Utiliser les groupes de la classe</button><button type="button" id="wfSaveClassGroups" class="secondary">Conserver cette composition</button></div>':''}
  function fromArrays(classId, arrays) {return {classId,groups:arrays.map((_,i)=>({id:String(i+1),name:`Groupe ${i+1}`})),assignments:Object.fromEntries(arrays.flatMap((ids,i)=>ids.map(id=>[id,String(i+1)]))),activeGroup:''}}
  function arrays(state) {return state.groups.map(g=>Object.entries(state.assignments).filter(([,v])=>String(v)===String(g.id)).map(([id])=>id))}
  function bind(state, students, draw) {
    document.getElementById('wfClassGroups')?.addEventListener('click',async()=>{
      try {
        const rows=await list(state.classId),dialog=document.createElement('dialog');
        dialog.style.cssText='max-width:min(92vw,600px);border:1px solid #bdd6e8;border-radius:18px;padding:24px';
        dialog.innerHTML='<h3>Groupes de la classe</h3><p>Une copie sera utilisée dans ce test. La composition conservée ne sera pas modifiée.</p>';
        rows.forEach(row=>{const b=document.createElement('button');b.textContent=row.name;b.style.display='block';b.onclick=async()=>{try{const imported=await copy(row.id,students);if(!imported.groups.length)throw Error('Aucun élève de cette composition ne participe à ce test.');if(state.groups.length&&!confirm('Remplacer les groupes de ce test ? Les résultats sont conservés.'))return;Object.assign(state,structuredClone(imported));dialog.close();await draw()}catch(e){alert(e.message)}};dialog.append(b)});
        if(!rows.length){const p=document.createElement('p');p.textContent='Aucune composition conservée pour cette classe.';dialog.append(p)}
        const close=document.createElement('button');close.textContent='Annuler';close.onclick=()=>dialog.close();dialog.append(close);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
      }catch(e){alert('Groupes indisponibles : '+e.message)}
    });
    document.getElementById('wfSaveClassGroups')?.addEventListener('click',async()=>{const name=prompt('Nom de la composition','Groupes de la classe');if(!name?.trim())return;try{await save(state.classId,name.trim(),state.groups,state.assignments);alert('Composition conservée dans la classe. Les modifications du test resteront indépendantes.')}catch(e){alert('Composition non confirmée : '+e.message)}});
  }
  globalThis.EpsClassGroups={list,copy,save,controls,bind,fromArrays,arrays};
})();
