// Module isole : le code vit dans une fonction, pas dans la portee globale.
// Deux fichiers peuvent donc declarer le meme nom sans SyntaxError qui tue la page.
// Les noms ci-dessous restent volontairement globaux : l'inline script d'index.html
// et les attributs onclick du HTML les appellent par leur nom nu.
(function () {
  let healthMode='dispense',healthClasses=[],healthStudents=[],healthDispenses=[],healthSelectedClassId=null,healthSelectedStudentId=null;
  const healthEsc=value=>String(value??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const healthToday=()=>new Date().toISOString().slice(0,10);
  function healthActive(row){const today=healthToday();return row.start_date<=today&&row.end_date>=today;}
  async function healthFetch(path){const response=await apiFetch(`${SUPABASE_URL}/rest/v1/${path}`);return response.ok?response.json():[];}
  async function initHealthTab(preselectedClassId=null){
    if(preselectedClassId)healthSelectedClassId=preselectedClassId;
    const host=document.getElementById('healthBody');if(!host)return;
    host.innerHTML='<div class="card muted">Chargement des données de santé…</div>';
    // Une dispense se consulte au bord du terrain, un accident se declare sur place : tout passe
    // par la copie locale, qui reste lisible sans reseau.
    [healthClasses,healthStudents,healthDispenses]=await Promise.all([
      lireTable('classes','classes?deleted=eq.false&select=*&order=name',
        {trier:(a,b)=>String(a.name||'').localeCompare(String(b.name||''))}),
      lireTable('students','students?deleted=eq.false&select=*&order=last_name,first_name',
        {trier:(a,b)=>String(a.last_name||'').localeCompare(String(b.last_name||''))}),
      lireTable('health_dispensations','health_dispensations?deleted=eq.false&select=*&order=start_date.desc',
        {trier:(a,b)=>String(b.start_date||'').localeCompare(String(a.start_date||''))})
    ]);
    if(!healthSelectedClassId||!healthClasses.some(c=>c.id===healthSelectedClassId))healthSelectedClassId=healthClasses[0]?.id||null;
    // Le motif ne s'affiche que si la colonne existe : le marqueur le dit sans faire echouer
    // un enregistrement pour l'apprendre.
    await verifierMotifDisponible();
    renderHealthTab();
  }
  function renderHealthTab(){
   const host=document.getElementById('healthBody');if(!host)return;
   host.innerHTML=`<div class="subtabbar healthTabs">${[['dispense','DISPENSE'],['accident','ACCIDENT'],['infirmerie','INFIRMERIE']].map(([id,label])=>`<button class="subtabbtn${healthMode===id?' active':''}" data-health-mode="${id}">${label}</button>`).join('')}</div><div id="healthModeBody"></div>`;
   host.querySelectorAll('[data-health-mode]').forEach(button=>button.onclick=()=>{healthMode=button.dataset.healthMode;renderHealthTab();});
   if(healthMode==='dispense')renderDispenseMode();else if(healthMode==='accident')renderAccidentMode();else document.getElementById('healthModeBody').innerHTML=`<div class="card healthEmpty"><h2>Infirmerie</h2><p>Cette rubrique est prête. Son formulaire sera ajouté à l’étape suivante.</p></div>`;
  }
  // Trois vues sous DISPENSE : la saisie, ses propres dispenses (en cours / passees), et celles
  // de tout l'etablissement. Les deux dernieres servent de bilan et de suivi.
  let dispenseVue='saisie';
  /** Collegues de l'etablissement, pour nommer l'auteur d'une dispense. Lu une fois. */
  let dispenseEquipe=null;
  /** Le motif n'existe qu'une fois schema_sante_2.sql passe. Avant, on n'en parle pas. */
  let dispenseMotifDispo=false;

  const MOTIFS=[['BLESSURE','Blessure'],['MALADIE','Maladie'],['CERTIFICAT','Certificat médical'],
    ['INAPTITUDE_PARTIELLE','Inaptitude partielle'],['AUTRE','Autre']];
  const motifLibelle=kind=>(MOTIFS.find(m=>m[0]===kind)||[null,''])[1];

  /** Le motif et ses onglets ne s'allument qu'une fois le SQL passe : sinon on ecrirait dans
   *  une colonne qui n'existe pas, et l'enregistrement serait refuse sans explication. */
  async function verifierMotifDisponible(){
    try{
      const res=await apiFetch(`${SUPABASE_URL}/rest/v1/eps_schema_marks?name=eq.sante_2&select=name`);
      dispenseMotifDispo=res.ok&&(await res.json()).length>0;
    }catch{ dispenseMotifDispo=false; }
    return dispenseMotifDispo;
  }

  async function nomEnseignant(userId){
    if(!userId)return 'Inconnu';
    if(userId===session?.user_id)return 'Vous';
    if(dispenseEquipe===null){
      try{ dispenseEquipe=(await loadTeamContext())?.members||[]; }catch{ dispenseEquipe=[]; }
    }
    const membre=dispenseEquipe.find(m=>m.id===userId);
    return membre?(membre.name||membre.email):'Un collègue';
  }

  /** Deux periodes qui se recouvrent pour le meme eleve : c'est la double saisie a empecher. */
  function chevauche(a,b){return a.start_date<=b.end_date&&b.start_date<=a.end_date;}

  function eleveNomme(studentId){
    const s=healthStudents.find(x=>x.id===studentId);
    return s?`${String(s.last_name||'').toUpperCase()} ${s.first_name||''}`.trim():'Élève';
  }
  function classeNommee(classId){
    const c=healthClasses.find(x=>x.id===classId);
    return c?c.name:'';
  }
  const jourFr=d=>d?new Date(d+'T12:00:00').toLocaleDateString('fr-FR'):'';

  function renderDispenseMode(){
   const body=document.getElementById('healthModeBody');
   const onglets=[['saisie','SAISIE'],['miennes','MES DISPENSÉS'],['toutes','TOUS LES DISPENSÉS']];
   body.innerHTML=`<div class="subtabbar" style="margin-bottom:10px">${onglets.map(([id,label])=>
     `<button class="subtabbtn${dispenseVue===id?' active':''}" data-dispense-vue="${id}">${label}</button>`).join('')}</div><div id="dispenseVueBody"></div>`;
   body.querySelectorAll('[data-dispense-vue]').forEach(b=>b.onclick=()=>{
     dispenseVue=b.dataset.dispenseVue; renderDispenseMode();
   });
   if(dispenseVue==='saisie')renderSaisieDispense();
   else renderListeDispenses(dispenseVue==='miennes');
  }

  function renderSaisieDispense(){
   const body=document.getElementById('dispenseVueBody');
   const classStudents=healthStudents.filter(s=>s.class_id===healthSelectedClassId);
   const current=healthDispenses.filter(d=>d.class_id===healthSelectedClassId&&healthActive(d));
   const selected=healthStudents.find(s=>s.id===healthSelectedStudentId);
   body.innerHTML=`<div class="card healthControls"><label>Classe<select id="healthClassSelect">${healthClasses.map(c=>`<option value="${healthEsc(c.id)}" ${c.id===healthSelectedClassId?'selected':''}>${healthEsc(c.name)}</option>`).join('')}</select></label><span class="healthCount">${current.length} dispense(s) en cours</span></div>${healthClasses.length?`<div class="healthGrid"><section class="card"><h2>Élèves de la classe</h2><div class="healthStudentList">${classStudents.map(student=>{const active=healthDispenses.find(d=>d.student_id===student.id&&healthActive(d));return `<button class="healthStudent ${student.id===healthSelectedStudentId?'selected':''}" data-health-student="${healthEsc(student.id)}"><span>${healthEsc(String(student.last_name||'').toUpperCase())} ${healthEsc(student.first_name)}</span><small>${active?`Dispensé jusqu’au ${jourFr(active.end_date)}${active.reason_kind?` · ${healthEsc(motifLibelle(active.reason_kind))}`:''}`:'Ajouter une dispense'}</small></button>`}).join('')||'<p class="muted">Aucun élève dans cette classe.</p>'}</div></section><section class="card" id="healthEditor">${selected&&selected.class_id===healthSelectedClassId?dispenseEditorHtml(selected):'<div class="healthEmpty"><h2>Nouvelle dispense</h2><p>Sélectionnez la ligne d’un élève.</p></div>'}</section></div>`:'<div class="card healthEmpty">Créez d’abord une classe.</div>'}`;
   const select=document.getElementById('healthClassSelect');
   if(select)select.onchange=()=>{healthSelectedClassId=select.value;healthSelectedStudentId=null;renderDispenseMode();};
   body.querySelectorAll('[data-health-student]').forEach(button=>button.onclick=()=>{
     healthSelectedStudentId=button.dataset.healthStudent;renderDispenseMode();});
   const form=document.getElementById('dispenseForm');if(form)form.onsubmit=saveDispense;
   body.querySelectorAll('.healthDelete').forEach(button=>button.onclick=()=>deleteDispense(button.dataset.id));
  }

  /** Les listes de bilan : les miennes, ou celles de tout l'etablissement, en cours puis passees. */
  function renderListeDispenses(seulementLesMiennes){
   const body=document.getElementById('dispenseVueBody');
   const today=healthToday();
   const lignes=healthDispenses.filter(d=>!seulementLesMiennes||d.user_id===session?.user_id);
   const enCours=lignes.filter(d=>d.end_date>=today).sort((a,b)=>a.end_date.localeCompare(b.end_date));
   const passees=lignes.filter(d=>d.end_date<today).sort((a,b)=>b.end_date.localeCompare(a.end_date));
   const tableau=(titre,rows,vide)=>`<section class="card"><h2>${titre} <span class="muted" style="font-weight:400">(${rows.length})</span></h2>`
     +(rows.length?`<div style="overflow-x:auto"><table><thead><tr><th>Élève</th><th>Classe</th><th>Début</th><th>Fin</th><th>Motif</th>${seulementLesMiennes?'':'<th>Saisie par</th>'}</tr></thead><tbody>`
       +rows.map(d=>`<tr><td><button class="secondary" style="margin-top:0" data-fiche="${healthEsc(d.id)}">${healthEsc(eleveNomme(d.student_id))}</button></td>`
         +`<td>${healthEsc(classeNommee(d.class_id))}</td><td>${jourFr(d.start_date)}</td><td>${jourFr(d.end_date)}</td>`
         +`<td>${healthEsc(motifLibelle(d.reason_kind)||'—')}</td>`
         +(seulementLesMiennes?'':`<td data-auteur="${healthEsc(d.user_id||'')}">…</td>`)
         +`</tr>`).join('')+`</tbody></table></div>`
      :`<p class="muted">${vide}</p>`)+`</section>`;
   body.innerHTML=tableau('En cours',enCours,'Aucune dispense en cours.')
     +tableau('Passées',passees,'Aucune dispense terminée.');
   body.querySelectorAll('[data-fiche]').forEach(b=>b.onclick=()=>ouvrirFicheDispense(b.dataset.fiche));
   // Les noms des collegues arrivent apres coup : la liste s'affiche sans attendre le reseau.
   body.querySelectorAll('[data-auteur]').forEach(async cell=>{
     cell.textContent=await nomEnseignant(cell.dataset.auteur);
   });
  }

  /** La fiche d'une dispense : debut, fin, motif, et qui l'a saisie. */
  function fenetreFicheDispense(){
    let voile=document.getElementById('dispenseFicheOverlay');
    if(voile)return voile;
    voile=document.createElement('div');
    voile.className='searchOverlay';
    voile.id='dispenseFicheOverlay';
    voile.innerHTML=`<div class="searchSheet"><div class="top" style="margin-bottom:6px"><h2 style="margin:0" id="dispenseFicheTitre">Dispense</h2><button class="secondary" id="dispenseFicheClose" style="margin-top:0">Fermer</button></div><div id="dispenseFicheBody"></div></div>`;
    document.body.appendChild(voile);
    voile.querySelector('#dispenseFicheClose').onclick=fermerFicheDispense;
    voile.addEventListener('click',e=>{if(e.target===voile)fermerFicheDispense();});
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&voile.classList.contains('open'))fermerFicheDispense();});
    return voile;
  }
  function fermerFicheDispense(){
    const voile=document.getElementById('dispenseFicheOverlay');
    if(!voile)return;
    if(voile.contains(document.activeElement))document.activeElement.blur();
    voile.classList.remove('open');
  }
  /**
   * La fiche d'une dispense, modifiable.
   *
   * Ouverte depuis le bilan Sante ou depuis la carte Dispenses d'une classe. Elle sert a
   * corriger les dates et le motif, ou a supprimer : consulter sans pouvoir rien faire obligeait
   * a repasser par l'onglet Sante pour la moindre correction.
   *
   * @param d la ligne de dispense
   * @param libelleEleve nom affiche, fourni par l'appelant quand le repertoire Sante n'est pas charge
   */
  async function ouvrirFichePourDispense(d, libelleEleve){
    if(!d)return;
    const voile=fenetreFicheDispense();
    voile.querySelector('#dispenseFicheTitre').textContent=libelleEleve||eleveNomme(d.student_id);
    const corps=voile.querySelector('#dispenseFicheBody');
    const sienne=d.user_id===session?.user_id;
    const motifs=dispenseMotifDispo
      ? `<label>Motif<select id="ficheKind">${MOTIFS.map(([v,l])=>`<option value="${v}"${v===d.reason_kind?' selected':''}>${l}</option>`).join('')}</select></label>`
        +`<label>Précision (facultatif)<input type="text" id="ficheReason" maxlength="200" value="${healthEsc(d.reason||'')}"></label>`
      : `<div class="muted">Le motif s’affichera une fois <code>schema_sante_2.sql</code> appliqué.</div>`;
    corps.innerHTML=`<div class="muted">${healthEsc(classeNommee(d.class_id))}</div>`
      +`<div class="muted" style="margin-top:4px">${healthActive(d)?'En cours':'Terminée'} · saisie par <span id="dispenseFicheAuteur">…</span></div>`
      +(sienne
        ? `<form id="ficheForm" style="margin-top:10px">
             <label>Début<input type="date" id="ficheStart" value="${healthEsc(d.start_date)}" required></label>
             <label>Fin<input type="date" id="ficheEnd" value="${healthEsc(d.end_date)}" required></label>
             ${motifs}
             <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px">
               <button type="submit">Enregistrer</button>
               <button type="button" class="danger" id="ficheSuppr" style="margin-top:0">Supprimer</button>
             </div>
             <div class="error" id="ficheErreur"></div>
           </form>`
        : `<div style="margin-top:10px"><strong>Du ${jourFr(d.start_date)} au ${jourFr(d.end_date)}</strong></div>`
          +`<div style="margin-top:8px"><strong>Motif</strong><div>${healthEsc(motifLibelle(d.reason_kind)||'Non précisé')}</div>`
          +`${d.reason?`<div class="muted">${healthEsc(d.reason)}</div>`:''}</div>`
          +`<div class="muted" style="margin-top:12px">Saisie par un collègue : elle ne se modifie que depuis son compte.</div>`);
    voile.classList.add('open');
    corps.querySelector('#dispenseFicheAuteur').textContent=await nomEnseignant(d.user_id);
    if(!sienne)return;

    corps.querySelector('#ficheSuppr').onclick=async()=>{
      const bouton=corps.querySelector('#ficheSuppr');
      bouton.disabled=true;
      // On ferme d'abord : le bouton disparait avec la fenetre, donc un second clic ne peut
      // pas partir pendant que l'effacement voyage.
      fermerFicheDispense();
      await deleteDispense(d.id);
      if(typeof rafraichirDispensesClasse==='function')rafraichirDispensesClasse();
    };
    corps.querySelector('#ficheForm').onsubmit=async(event)=>{
      event.preventDefault();
      const debut=corps.querySelector('#ficheStart').value;
      const fin=corps.querySelector('#ficheEnd').value;
      const erreur=corps.querySelector('#ficheErreur');
      erreur.textContent='';
      if(!debut||!fin||fin<debut){ erreur.textContent="La date de fin doit être postérieure ou égale à la date de début."; return; }
      // Le meme garde-fou qu'a la saisie, en s'ignorant soi-meme : corriger une dispense ne doit
      // pas se heurter a sa propre periode.
      const conflit=healthDispenses.find(x=>x.id!==d.id&&x.student_id===d.student_id&&!x.deleted
        &&chevauche(x,{start_date:debut,end_date:fin}));
      if(conflit){
        erreur.textContent=`Cet élève a déjà une dispense du ${jourFr(conflit.start_date)} au ${jourFr(conflit.end_date)}.`;
        return;
      }
      const ligne={...d,start_date:debut,end_date:fin,updated_at:new Date().toISOString(),deleted:false};
      if(dispenseMotifDispo){
        ligne.reason_kind=corps.querySelector('#ficheKind')?.value||'AUTRE';
        ligne.reason=corps.querySelector('#ficheReason')?.value.trim()||null;
      }
      try{ await enregistrerLigne('health_dispensations',ligne); }
      catch(e){ erreur.textContent=e.message; return; }
      const place=healthDispenses.findIndex(x=>x.id===d.id);
      if(place>=0)healthDispenses[place]=ligne; else healthDispenses.unshift(ligne);
      fermerFicheDispense();
      if(document.getElementById('healthModeBody'))renderDispenseMode();
      if(typeof rafraichirDispensesClasse==='function')rafraichirDispensesClasse();
    };
  }

  async function ouvrirFicheDispense(id){
    await ouvrirFichePourDispense(healthDispenses.find(x=>x.id===id));
  }

  function dispenseEditorHtml(student){
   const history=healthDispenses.filter(d=>d.student_id===student.id);
   const motifs=dispenseMotifDispo?`<label>Motif<select id="dispenseKind">${MOTIFS.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label>Précision (facultatif)<input type="text" id="dispenseReason" maxlength="200" placeholder="ex : entorse cheville droite"></label>`:`<div class="muted">Le motif s’affichera une fois <code>schema_sante_2.sql</code> appliqué.</div>`;
   return `<h2>${healthEsc(String(student.last_name||'').toUpperCase())} ${healthEsc(student.first_name)}</h2><form id="dispenseForm"><label>Début de la dispense<input type="date" id="dispenseStart" value="${healthToday()}" required></label><label>Fin de la dispense<input type="date" id="dispenseEnd" value="${healthToday()}" required></label>${motifs}<button type="submit">Valider la dispense</button></form><h3>Historique de l’élève</h3>${history.length?history.map(d=>`<div class="healthHistory"><span>${jourFr(d.start_date)} → ${jourFr(d.end_date)}${d.reason_kind?` · ${healthEsc(motifLibelle(d.reason_kind))}`:''}</span><strong>${healthActive(d)?'En cours':'Terminée'}</strong></div>`).join(''):'<p class="muted">Aucune dispense enregistrée.</p>'}`;
  }
  // L'identifiant est tire ici et non par le serveur : une dispense saisie sans reseau doit
  // pouvoir etre affichee, puis envoyee telle quelle quand la connexion revient.
  async function saveDispense(event){
    event.preventDefault();
    const start=document.getElementById('dispenseStart').value,end=document.getElementById('dispenseEnd').value;
    if(!start||!end||end<start){alert('La date de fin doit être postérieure ou égale à la date de début.');return;}
    // Le garde-fou : deux dispenses qui se recouvrent pour le meme eleve, c'est une double
    // saisie. On le dit ici, et la base le refuse aussi - le site n'ecrit pas seul.
    const conflit=healthDispenses.find(d=>d.student_id===healthSelectedStudentId&&!d.deleted
      &&chevauche(d,{start_date:start,end_date:end}));
    if(conflit){
      alert(`Cet élève a déjà une dispense du ${jourFr(conflit.start_date)} au ${jourFr(conflit.end_date)}.\nModifiez-la ou supprimez-la plutôt que d’en créer une seconde.`);
      return;
    }
    const ligne={id:crypto.randomUUID(),user_id:session.user_id,class_id:healthSelectedClassId,
      student_id:healthSelectedStudentId,start_date:start,end_date:end,
      updated_at:new Date().toISOString(),deleted:false};
    if(dispenseMotifDispo){
      ligne.reason_kind=document.getElementById('dispenseKind')?.value||'AUTRE';
      ligne.reason=document.getElementById('dispenseReason')?.value.trim()||null;
    }
    try{ await enregistrerLigne('health_dispensations',ligne); }
    catch(e){ alert(e.message); return; }
    healthDispenses.unshift(ligne);
    renderDispenseMode();
  }
  // L'effacement laisse une trace au lieu de retirer la ligne : sans elle, la dispense, absente
  // du serveur mais presente dans la copie locale, y reviendrait a la synchronisation suivante.
  async function deleteDispense(id){
    if(!confirm('Supprimer cette dispense ?'))return;
    try{ await supprimerLigne('health_dispensations',id); }
    catch(e){ alert(e.message); return; }
    healthDispenses=healthDispenses.filter(d=>d.id!==id);
    renderDispenseMode();
  }
  function openClassDispenses(classId){healthSelectedClassId=classId;healthMode='dispense';showTab('health');}

  let accidentStep=0,accidentDraft={class_id:'',student_id:'',facts_nature:'',occurred_date:healthToday(),occurred_time:new Date().toTimeString().slice(0,5),damage_type:'',course_context:'EPS',course_other:'',time_context:'TEMPS_SCOLAIRE',activity_nature:'',responsible_name:'',diagram_data:'',witnesses:'',urgency_code:'VERT',decision_taken:''};
  const accidentSteps=['Élève','Nature des faits','Date et heure','Dommage','Cours de','Moment des faits','Activité proposée','Responsable','Schéma','Témoins','Gestion de l’incident','Récapitulatif'];
  function renderAccidentMode(){
   const host=document.getElementById('healthModeBody');
   if(!accidentDraft.responsible_name)accidentDraft.responsible_name=(typeof loadPrefs==='function'&&loadPrefs().teacherName)||session?.email?.split('@')[0]||'';
   host.innerHTML=`<section class="card accidentWizard"><div class="accidentProgress"><strong>Étape ${accidentStep+1}/${accidentSteps.length}</strong><span>${healthEsc(accidentSteps[accidentStep])}</span><progress value="${accidentStep+1}" max="${accidentSteps.length}"></progress></div><div id="accidentStepBody">${accidentStepHtml()}</div><div class="accidentNav">${accidentStep?'<button class="secondary" id="accidentPrev">← Précédent</button>':'<span></span>'}<button id="accidentNext">${accidentStep===accidentSteps.length-1?'Enregistrer et créer le PDF':'Suivant →'}</button></div></section>`;
   document.getElementById('accidentPrev')?.addEventListener('click',()=>{captureAccidentStep();accidentStep--;renderAccidentMode();});
   document.getElementById('accidentNext').onclick=async()=>{if(!captureAccidentStep(true))return;if(accidentStep<accidentSteps.length-1){accidentStep++;renderAccidentMode();}else await saveAccident();};
   if(accidentStep===0){const cs=document.getElementById('accClass');cs.onchange=()=>{accidentDraft.class_id=cs.value;accidentDraft.student_id='';renderAccidentMode();};}
   if(accidentStep===8)setupAccidentCanvas();
  }
  function accidentStepHtml(){
   const classStudents=healthStudents.filter(s=>s.class_id===(accidentDraft.class_id||healthClasses[0]?.id));
   const choices=(name,items,current)=>`<div class="accidentChoices">${items.map(([v,l,d])=>`<label class="accidentChoice ${current===v?'selected':''}"><input type="radio" name="${name}" value="${v}" ${current===v?'checked':''}><strong>${l}</strong>${d?`<small>${d}</small>`:''}</label>`).join('')}</div>`;
   switch(accidentStep){
    case 0: accidentDraft.class_id ||= healthClasses[0]?.id||''; return `<h2>Sélectionner l’élève</h2><label>Classe<select id="accClass">${healthClasses.map(c=>`<option value="${c.id}" ${c.id===accidentDraft.class_id?'selected':''}>${healthEsc(c.name)}</option>`).join('')}</select></label><div class="healthStudentList">${classStudents.map(s=>`<label class="healthStudent ${s.id===accidentDraft.student_id?'selected':''}"><input type="radio" name="accStudent" value="${s.id}" ${s.id===accidentDraft.student_id?'checked':''}><span><b>${healthEsc(s.last_name)} ${healthEsc(s.first_name)}</b> · ${healthEsc(s.birth_date||'Date de naissance non renseignée')} · ${healthEsc(healthClasses.find(c=>c.id===s.class_id)?.name||'')}</span></label>`).join('')}</div>`;
    case 1:return `<h2>Précisez la nature des faits</h2><textarea id="accFacts" rows="8" placeholder="Décrivez précisément et chronologiquement les faits…">${healthEsc(accidentDraft.facts_nature)}</textarea>`;
    case 2:return `<h2>Date et heure des faits</h2><div class="row"><label>Date<input id="accDate" type="date" value="${accidentDraft.occurred_date}"></label><label>Heure<input id="accTime" type="time" value="${accidentDraft.occurred_time}"></label></div>`;
    case 3:return `<h2>Dommage</h2>${choices('accDamage',[['MATERIEL','Matériel','Dégât concernant un objet ou une installation'],['PHYSIQUE','Physique','Blessure ou atteinte concernant une personne']],accidentDraft.damage_type)}`;
    case 4:return `<h2>Cours de</h2>${choices('accCourse',[['EPS','EPS','Cours d’éducation physique'],['AS','AS','Association sportive'],['AUTRE','Autre','À préciser ci-dessous']],accidentDraft.course_context)}<label>Précision si « Autre »<input id="accCourseOther" value="${healthEsc(accidentDraft.course_other)}"></label>`;
    case 5:return `<h2>Quand les faits ont-ils eu lieu ?</h2>${choices('accWhen',[['PERISCOLAIRE','Périscolaire',''],['SORTIE_SCOLAIRE','Sortie scolaire',''],['TEMPS_SCOLAIRE','Temps scolaire',''],['HORS_TEMPS_SCOLAIRE','Hors temps scolaire','']],accidentDraft.time_context)}`;
    case 6:return `<h2>Nature de l’activité proposée</h2><textarea id="accActivity" rows="6" placeholder="Activité, exercice, consigne donnée…">${healthEsc(accidentDraft.activity_nature)}</textarea>`;
    case 7:return `<h2>Personne responsable du cours</h2><label>Nom et prénom<input id="accResponsible" value="${healthEsc(accidentDraft.responsible_name)}"></label><p class="muted">Prérempli depuis le profil enseignant, mais modifiable pour cette déclaration.</p>`;
    case 8:return `<h2>Schéma de l’accident</h2><p class="muted">Dessinez au doigt ou à la souris. Vous pouvez aussi importer une image.</p><canvas id="accCanvas" width="760" height="360"></canvas><div class="row"><button type="button" class="secondary" id="accClear">Effacer</button><label class="secondary accidentImport">Importer une image<input id="accImage" type="file" accept="image/*" hidden></label></div>`;
    case 9:return `<h2>Témoin(s) éventuel(s)</h2><textarea id="accWitnesses" rows="6" placeholder="Nom, prénom, coordonnées ou précisions. Laissez vide s’il n’y en a pas.">${healthEsc(accidentDraft.witnesses)}</textarea>`;
    case 10:return `<h2>Gestion de l’incident</h2>${choices('accUrgency',[['VERT','Code vert — Sans urgence particulière','Situation maîtrisée ne nécessitant pas de prise en charge urgente.'],['ORANGE','Code orange — Urgence relative','Faits relativement urgents ou inquiétants.'],['ROUGE','Code rouge — Urgence absolue','Faits urgents ou graves.']],accidentDraft.urgency_code)}<label>Quelle décision a été prise ?<textarea id="accDecision" rows="5">${healthEsc(accidentDraft.decision_taken)}</textarea></label>`;
    default: {const s=healthStudents.find(x=>x.id===accidentDraft.student_id),c=healthClasses.find(x=>x.id===accidentDraft.class_id);return `<h2>Vérifiez la déclaration</h2><div class="accidentSummary"><b>Élève</b><span>${healthEsc(s?`${s.last_name} ${s.first_name}`:'')} · ${healthEsc(c?.name||'')}</span><b>Faits</b><span>${healthEsc(accidentDraft.facts_nature)}</span><b>Date</b><span>${accidentDraft.occurred_date} à ${accidentDraft.occurred_time}</span><b>Dommage</b><span>${accidentDraft.damage_type}</span><b>Cadre</b><span>${accidentDraft.course_context} · ${accidentDraft.time_context}</span><b>Activité</b><span>${healthEsc(accidentDraft.activity_nature)}</span><b>Responsable</b><span>${healthEsc(accidentDraft.responsible_name)}</span><b>Témoins</b><span>${healthEsc(accidentDraft.witnesses||'Aucun indiqué')}</span><b>Urgence</b><span>Code ${accidentDraft.urgency_code.toLowerCase()} — ${healthEsc(accidentDraft.decision_taken)}</span></div><p class="muted">Après enregistrement, le PDF pourra être téléchargé, enregistré ou partagé.</p>`;}
   }
  }
  function captureAccidentStep(validate=false){const val=id=>document.getElementById(id)?.value||'',radio=name=>document.querySelector(`input[name="${name}"]:checked`)?.value||'';if(accidentStep===0)accidentDraft.student_id=radio('accStudent');if(accidentStep===1)accidentDraft.facts_nature=val('accFacts').trim();if(accidentStep===2){accidentDraft.occurred_date=val('accDate');accidentDraft.occurred_time=val('accTime');}if(accidentStep===3)accidentDraft.damage_type=radio('accDamage');if(accidentStep===4){accidentDraft.course_context=radio('accCourse');accidentDraft.course_other=val('accCourseOther').trim();}if(accidentStep===5)accidentDraft.time_context=radio('accWhen');if(accidentStep===6)accidentDraft.activity_nature=val('accActivity').trim();if(accidentStep===7)accidentDraft.responsible_name=val('accResponsible').trim();if(accidentStep===8){const c=document.getElementById('accCanvas');if(c)accidentDraft.diagram_data=c.toDataURL('image/png');}if(accidentStep===9)accidentDraft.witnesses=val('accWitnesses').trim();if(accidentStep===10){accidentDraft.urgency_code=radio('accUrgency');accidentDraft.decision_taken=val('accDecision').trim();}const required=[accidentDraft.student_id,accidentDraft.facts_nature,accidentDraft.occurred_date,accidentDraft.occurred_time,accidentDraft.damage_type,accidentDraft.course_context,accidentDraft.time_context,accidentDraft.activity_nature,accidentDraft.responsible_name,accidentDraft.urgency_code,accidentDraft.decision_taken];if(validate&&accidentStep<11&&!required.slice(0,[1,2,4,5,7,8,8,9,9,9,11][accidentStep]).every(Boolean)){alert('Complétez cette étape avant de continuer.');return false;}if(validate&&accidentStep===4&&accidentDraft.course_context==='AUTRE'&&!accidentDraft.course_other){alert('Précisez le cours concerné.');return false;}return true;}
  function setupAccidentCanvas(){const canvas=document.getElementById('accCanvas'),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);if(accidentDraft.diagram_data){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,canvas.width,canvas.height);img.src=accidentDraft.diagram_data;}let drawing=false;const point=e=>{const r=canvas.getBoundingClientRect(),p=e.touches?.[0]||e;return [(p.clientX-r.left)*canvas.width/r.width,(p.clientY-r.top)*canvas.height/r.height]};canvas.onpointerdown=e=>{drawing=true;ctx.beginPath();ctx.moveTo(...point(e));};canvas.onpointermove=e=>{if(!drawing)return;ctx.lineWidth=4;ctx.lineCap='round';ctx.strokeStyle='#173a57';ctx.lineTo(...point(e));ctx.stroke();};canvas.onpointerup=canvas.onpointerleave=()=>drawing=false;document.getElementById('accClear').onclick=()=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);accidentDraft.diagram_data='';};document.getElementById('accImage').onchange=e=>{const f=e.target.files[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);};img.src=reader.result;};reader.readAsDataURL(f);};}
  async function saveAccident(){const payload={user_id:session.user_id,class_id:accidentDraft.class_id,student_id:accidentDraft.student_id,facts_nature:accidentDraft.facts_nature,occurred_at:`${accidentDraft.occurred_date}T${accidentDraft.occurred_time}:00`,damage_type:accidentDraft.damage_type,course_context:accidentDraft.course_context,course_other:accidentDraft.course_other||null,time_context:accidentDraft.time_context,activity_nature:accidentDraft.activity_nature,responsible_name:accidentDraft.responsible_name,diagram_data:accidentDraft.diagram_data||null,witnesses:accidentDraft.witnesses||null,urgency_code:accidentDraft.urgency_code,decision_taken:accidentDraft.decision_taken};try{ await enregistrerLigne('health_accidents',{id:crypto.randomUUID(),...payload,updated_at:new Date().toISOString(),deleted:false}); }catch(e){ alert(e.message||'Enregistrement impossible. Vérifiez que le nouveau SQL Santé a été exécuté.'); return; }openAccidentPrintable();}
  function openAccidentPrintable(){const s=healthStudents.find(x=>x.id===accidentDraft.student_id),c=healthClasses.find(x=>x.id===accidentDraft.class_id),w=open('','_blank');w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Déclaration accident</title><style>body{font-family:Arial;padding:35px;color:#173a57}h1{color:#087dca}.line{padding:10px;border-bottom:1px solid #ccd9e2}b{display:inline-block;width:190px}img{max-width:100%;border:1px solid #ccd9e2}@media print{button{display:none}}</style></head><body><h1>Déclaration d’accident</h1><div class="line"><b>Élève</b>${healthEsc(s?`${s.last_name} ${s.first_name}`:'')} · ${healthEsc(c?.name||'')}</div><div class="line"><b>Date et heure</b>${accidentDraft.occurred_date} ${accidentDraft.occurred_time}</div><div class="line"><b>Nature des faits</b>${healthEsc(accidentDraft.facts_nature)}</div><div class="line"><b>Dommage</b>${accidentDraft.damage_type}</div><div class="line"><b>Cadre</b>${accidentDraft.course_context} · ${accidentDraft.time_context}</div><div class="line"><b>Activité</b>${healthEsc(accidentDraft.activity_nature)}</div><div class="line"><b>Responsable</b>${healthEsc(accidentDraft.responsible_name)}</div><div class="line"><b>Témoins</b>${healthEsc(accidentDraft.witnesses||'Aucun indiqué')}</div><div class="line"><b>Gestion</b>Code ${accidentDraft.urgency_code.toLowerCase()} — ${healthEsc(accidentDraft.decision_taken)}</div>${accidentDraft.diagram_data?`<h2>Schéma</h2><img src="${accidentDraft.diagram_data}">`:''}<p><button onclick="print()">Enregistrer / imprimer en PDF</button></p></body></html>`);w.document.close();accidentStep=0;accidentDraft={...accidentDraft,student_id:'',facts_nature:'',damage_type:'',activity_nature:'',diagram_data:'',witnesses:'',decision_taken:''};renderAccidentMode();}

  // Surface publique du module.
  globalThis.healthEsc = healthEsc;
  globalThis.healthToday = healthToday;
  globalThis.healthActive = healthActive;
  globalThis.healthFetch = healthFetch;
  globalThis.initHealthTab = initHealthTab;
  /** Redessine Sante quand une synchronisation ramene des dispenses saisies ailleurs. */
  globalThis.rafraichirSanteApresSynchro = () => { if(document.getElementById('healthBody')) initHealthTab(); };
  globalThis.renderHealthTab = renderHealthTab;
  globalThis.renderDispenseMode = renderDispenseMode;
  globalThis.dispenseEditorHtml = dispenseEditorHtml;
  globalThis.saveDispense = saveDispense;
  globalThis.deleteDispense = deleteDispense;
  globalThis.openClassDispenses = openClassDispenses;
  globalThis.renderSaisieDispense = renderSaisieDispense;
  globalThis.renderListeDispenses = renderListeDispenses;
  globalThis.ouvrirFicheDispense = ouvrirFicheDispense;
  globalThis.ouvrirFichePourDispense = ouvrirFichePourDispense;
  globalThis.fermerFicheDispense = fermerFicheDispense;
  globalThis.verifierMotifDisponible = verifierMotifDisponible;
  globalThis.motifLibelle = motifLibelle;
  globalThis.chevaucheDispense = chevauche;
  globalThis.accidentSteps = accidentSteps;
  globalThis.renderAccidentMode = renderAccidentMode;
  globalThis.accidentStepHtml = accidentStepHtml;
  globalThis.captureAccidentStep = captureAccidentStep;
  globalThis.setupAccidentCanvas = setupAccidentCanvas;
  globalThis.saveAccident = saveAccident;
  globalThis.openAccidentPrintable = openAccidentPrintable;
})();
