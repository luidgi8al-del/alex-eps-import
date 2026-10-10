/* Rattrapage modulaire des Outils web. Ne modifie ni les tests EPS ni le 3x500. */
(function(){
  const layouts={activities:"Par activité",functions:"Par fonction",moments:"Par moment",hybrid:"Hybride"};
  const tools=[
    ["timers","Chronomètres","Chrono, compte à rebours et intervalles","⏱️","Terrain",["Athlétisme","Natation"]],
    ["multi-chrono","Multi-chrono","Plusieurs élèves ou groupes simultanément","⏱️","Terrain",["Athlétisme","Natation"]],
    ["teams","Équipes","Former et équilibrer les équipes","👥","Organiser",["Sports collectifs","Raquettes","Gymnastique","Escalade"]],
    ["tournament","Tournois","Rencontres, scores et classement","🏆","Organiser",["Sports collectifs","Raquettes"]],
    ["score","Tableau de score","Suivre une rencontre","🏅","Terrain",["Sports collectifs","Raquettes"]],
    ["rotations","Rotations","Ateliers et changements de groupes","🔄","Organiser",["Gymnastique","Escalade","Athlétisme"]],
    ["observer","Observateur","Compter et analyser les actions","👁️","Observer",["Sports collectifs","Raquettes"]],
    ["climb-observation","Observation Escalade","Placement des pieds, bras tendus, équilibre","🧗","Observer",["Escalade"]],
    ["climb-test","Test Escalade /20","Progression, difficulté, technique et assurage","🧗","Évaluer",["Escalade"]],
    ["random","Tirage au sort","Choisir rapidement un élève","🎲","Organiser",["Tous"]],
    ["tests","Tests EPS","Tests et suivi des progrès","📋","Évaluer",["Athlétisme"]],
    // Seulement "Tous" : le tag "Tous" fait deja apparaitre l'outil dans chaque activite (voir
    // le filtre plus bas, qui garde un outil des que sa liste contient l'activite choisie OU
    // "Tous") - l'ajouter en plus pour Athletisme et Gymnastique le faisait ressortir partout,
    // sans pouvoir le retrouver seulement dans "Tous".
    ["condition-fitness","Condition physique générale","Six ateliers, groupes et note sur 20","💪","Évaluer",["Tous"]],
    ["vma","Tests VMA","VAMEVAL, Léger et Cooper","💓","Évaluer",["Athlétisme"]],
    ["aptitudes","Aptitudes 6e","Sprint, endurance et saut","📊","Évaluer",["Athlétisme"]],
    ["swim","Savoir Nager","Parcours et attestations","🏊","Évaluer",["Natation"]],
    ["swim-observation","Observation Natation","Groupes de niveau et indicateurs techniques","🤿","Évaluer",["Natation"]],
    ["measures","Mesures","Distance, vitesse et allure","📏","Évaluer",["Athlétisme"]],
    ["speed","Vitesse – passages","Groupes, passages et courbe","🏃","Observer",["Athlétisme"]],
    ["impacts","Marqueur d’impacts","Zones jouées sur le terrain","🎯","Observer",["Raquettes"]],
    ["effort","Effort","Ressenti et zones d’intensité","❤️","Évaluer",["Athlétisme"]],
    ["signals","Signaux sonores","Départs et rotations","🔊","Terrain",["Tous"]],
    ["acrosport","Groupes Acrosport","Binômes, trinômes et groupes","🤸","Organiser",["Gymnastique"]],
    ["gym-observation","Observation Gymnastique","Difficulté par figure et erreurs","🤸","Évaluer",["Gymnastique"]]
  ].map(x=>({id:x[0],title:x[1],subtitle:x[2],icon:x[3],fn:x[4],activities:x[5]}));
  // Le mode cours (cours.js) propose les memes outils dans sa boite a outils.
  globalThis.EpsToolsCatalog=tools;
  const activityMeta={"Athlétisme":["🏃","Chronos · 3×500 · VMA · passages"],"Natation":["🏊","Chronos · attestations · tests"],"Sports collectifs":["🏀","Scores · tournois · observations"],"Raquettes":["🏸","Scores · tournois · impacts"],"Gymnastique":["🤸","Groupes · observation · rotations"],"Escalade":["🧗","Groupes · rotations · observation"],"Tous":["🧰","Outils transversaux"]};
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const prefKey="eps_tools_layout";
  const account=()=>typeof session!=="undefined"&&session?.user_id?session.user_id:"local";
  const favoritesKey=()=>`eps_tools_favorites:${account()}`;
  const readFavorites=()=>{try{return new Set(JSON.parse(localStorage.getItem(favoritesKey())||"[]"))}catch{return new Set()}};
  const writeFavorites=value=>localStorage.setItem(favoritesKey(),JSON.stringify([...value]));
  const testFavoriteId=key=>`eps-test:${key}`;
  function epsTestTool(key){
    const test=globalThis.EpsTests?.TESTS?.[key];if(!test)return null;
    return {id:testFavoriteId(key),title:test.label,subtitle:test.protocol||"Test EPS",icon:"📋",fn:"Évaluer",activities:["Athlétisme"],epsTestKey:key};
  }
  function favoriteTools(){
    return [...readFavorites()].map(id=>{
      if(id.startsWith("eps-test:"))return epsTestTool(id.slice(9));
      return tools.find(t=>t.id===id);
    }).filter(Boolean);
  }
  function toggleFavoriteId(id){const favorites=readFavorites();favorites.has(id)?favorites.delete(id):favorites.add(id);writeFavorites(favorites);pousserFavorisPartages(favorites);return favorites.has(id)}

  // ---- Favoris partages avec l'application (tool_favorites, schema_tool_favorites.sql) ----
  // Meme principe que le profil professeur : une ligne par compte, une revision qui empeche un
  // enregistrement en retard d'ecraser un ajout plus recent fait depuis l'autre appareil. Le
  // navigateur garde sa copie locale (readFavorites/writeFavorites) pour un affichage immediat ;
  // le serveur est ce qui fait circuler la liste entre le telephone et le site.
  let favorisRevision=0;
  let favorisChargementFait=false;
  async function chargerFavorisPartages(){
    if(typeof session==="undefined"||!session?.user_id)return;
    try{
      const res=await apiFetch(`${SUPABASE_URL}/rest/v1/tool_favorites?user_id=eq.${session.user_id}&select=favorites,revision`);
      if(!res.ok)return;
      const lignes=await res.json();
      const locaux=readFavorites();
      if(lignes.length===0){
        // Rien cote serveur : si le navigateur a deja des favoris (ancienne liste locale), on
        // les publie pour amorcer le partage plutot que d'attendre un prochain clic.
        favorisRevision=0;
        if(locaux.size)await pousserFavorisPartages(locaux);
        favorisChargementFait=true;
        return;
      }
      favorisRevision=lignes[0].revision||0;
      const distants=new Set(Array.isArray(lignes[0].favorites)?lignes[0].favorites:[]);
      // Union des deux cotes : un favori ajoute hors connexion sur l'un ne doit pas disparaitre
      // parce que l'autre etait ouvert au meme moment.
      const fusion=new Set([...locaux,...distants]);
      const identique=fusion.size===locaux.size&&[...fusion].every(id=>locaux.has(id));
      writeFavorites(fusion);
      favorisChargementFait=true;
      if(fusion.size!==distants.size)await pousserFavorisPartages(fusion);
      if(!identique&&typeof draw==="function")draw();
    }catch{ /* Hors connexion : la liste locale reste valable, on reessaiera a la prochaine ouverture. */ }
  }
  async function pousserFavorisPartages(favorisSet){
    if(typeof session==="undefined"||!session?.user_id)return;
    try{
      const res=await apiFetch(`${SUPABASE_URL}/rest/v1/rpc/save_tool_favorites`,{method:"POST",
        body:JSON.stringify({p_revision:favorisRevision,p_favorites:[...favorisSet]})});
      if(!res.ok)return;
      const out=await res.json();
      if(out?.saved)favorisRevision=out.revision;
      else if(favorisChargementFait){
        // Une autre session a ecrit entre-temps : on relit sa version et on refusionne au lieu
        // d'echouer silencieusement.
        favorisRevision=0;
        await chargerFavorisPartages();
      }
    }catch{ /* Retente au prochain changement de favori ou a la prochaine ouverture. */ }
  }
  // "Divers EPS" (rotations, observations, tournois, groupes Acrosport...) passe desormais par
  // le meme circuit Supabase que le reste du site (lireTable/enregistrerLigne), au lieu de ne
  // vivre que dans la memoire du navigateur : un changement d'appareil ou un cache vide ne les
  // efface plus. _raw garde la ligne telle que recue, pour reecrire une suppression douce sans
  // reconstruire les champs.
  async function readWorks(){
    try{
      const rows=await lireTable("eps_saved_tool_works","eps_saved_tool_works?deleted=eq.false&select=*&order=updated_at.desc",{trier:(a,b)=>String(b.updated_at||"").localeCompare(String(a.updated_at||""))});
      return rows.filter(r=>!session?.user_id||r.user_id===session.user_id).map(r=>({
        id:r.id,type:r.type,title:r.title,classId:r.class_id||null,period:+r.period_number||1,
        payload:(()=>{try{return JSON.parse(r.payload||"{}")}catch{return{}}})(),
        createdAt:r.created_at,updatedAt:r.updated_at,_raw:r
      }));
    }catch{return[]}
  }
  let activity=null,query="",showFavorites=false;
  function toolCard(t){const favorite=readFavorites().has(t.id),tone=Math.abs([...t.id].reduce((n,c)=>n+c.charCodeAt(0),0))%4;return `<div class="tools-card-wrap tools-premium-card tone-${tone}"><button class="tools-modern-card" data-open-modern="${t.id}"><span class="tools-card-copy"><strong>${esc(t.title)}</strong><small>${esc(t.subtitle)}</small></span><span class="tools-card-illustration" aria-hidden="true"><i>${t.icon}</i></span></button><button class="tools-favorite-star ${favorite?"active":""}" data-favorite-tool="${t.id}" aria-label="${favorite?"Retirer des favoris":"Ajouter aux favoris"}">${favorite?"★":"☆"}</button></div>`}
  function favoritesShortcut(){const count=readFavorites().size;return `<button class="tools-favorites-shortcut" id="toolsFavoritesShortcut"><i>★</i><span><strong>Favoris</strong><small>${count?`${count} outil${count>1?"s":""} en accès rapide`:"Cliquez sur l’étoile d’un outil pour l’ajouter"}</small></span><b>›</b></button>`}
  function draw(){
    const host=document.getElementById("toolsWorkspace");if(!host)return;
    const layout=localStorage.getItem(prefKey)||"activities";
    let content="";
    if(showFavorites){const rows=favoriteTools();content=`<div class="tools-hero"><h2>Favoris</h2><p>Vos outils en accès rapide</p></div><section class="tools-section"><div class="tools-section-head tools-section-head-with-back"><button class="tools-section-back" id="toolsFavoritesBack">←</button><h3>Mes favoris</h3><span>${rows.length} outil${rows.length>1?"s":""}</span></div>${rows.length?`<div class="tools-layout-grid">${rows.map(toolCard).join("")}</div>`:`<div class="tools-favorites-empty"><i>☆</i><strong>Aucun favori</strong><span>Cliquez sur la petite étoile d’un outil pour le retrouver ici.</span></div>`}</section>`}
    // Condition physique est tague "Tous" : sans cette exception, la regle "Tous" -> visible
    // dans chaque activite le faisait ressortir sous Natation, Escalade, etc. On le garde
    // reserve a sa propre categorie "Tous", ou la carte "Tous" continue de le montrer.
    else if(activity){const rows=tools.filter(t=>(activity==="Tous"||t.id!=="condition-fitness") && (t.activities.includes(activity)||t.activities.includes("Tous")));content=`${favoritesShortcut()}<section class="tools-section"><div class="tools-section-head tools-section-head-with-back"><button class="tools-section-back" id="toolsActivityBack">←</button><h3>${esc(activity)}</h3><span>${rows.length} outils</span></div><div class="tools-layout-grid">${rows.map(toolCard).join("")}</div></section>`}
    else if(layout==="activities")content=`${favoritesShortcut()}<section class="tools-section"><div class="tools-section-head"><h3>Choisir une activité</h3><span>outils adaptés</span></div><div class="tools-layout-grid">${Object.entries(activityMeta).map(([n,m])=>`<button class="tools-activity-card" data-activity="${esc(n)}"><i>${m[0]}</i><span><strong>${esc(n)}</strong><small>${esc(m[1])}</small></span></button>`).join("")}</div></section>`;
    else {let rows=tools.filter(t=>!query||`${t.title} ${t.subtitle}`.toLowerCase().includes(query.toLowerCase()));if(layout==="functions")content=grouped(rows,t=>t.fn,"Outils classés par fonction");else if(layout==="moments")content=grouped(rows,t=>t.fn==="Terrain"?"Pendant la séance":t.fn==="Organiser"?"Avant la séance":"Observer et évaluer","Outils classés par moment");else content=`<div class="tools-hero"><h2>Mes outils</h2><p>Accès rapide et familles</p></div>${favoritesShortcut()}<div class="tools-toolbar"><input id="toolsSearch" placeholder="Rechercher un outil" value="${esc(query)}"></div><section class="tools-section"><div class="tools-layout-grid">${rows.map(toolCard).join("")}</div></section>`;if(layout==="functions"||layout==="moments")content=content.replace('</div>',`</div>${favoritesShortcut()}`)}
    host.className="tools-workspace";host.innerHTML=content;bind(host);
    // Choisir une activite, les favoris ou revenir en arriere doit toujours reprendre en haut de
    // la page : sans cela, un menu ouvert depuis le bas d'un long ecran restait scrolle pareil,
    // et affichait le milieu ou la fin de la liste suivante au lieu de son debut.
    window.scrollTo(0,0);
  }
  // scrollIntoView a disparu d'ici : showTab() remet deja la page a (0,0) a chaque changement
  // d'onglet, et scrollIntoView({block:"start"}) l'ecrasait juste apres en recalant sur la
  // position de toolsWorkspace dans la page plutot que sur le haut reel - Outils s'ouvrait donc
  // plus bas que les autres onglets (Equipement par ex., qui n'a pas cet appel).
  function resetToolsWorkspace(){activity=null;query="";showFavorites=false;const panel=document.getElementById("toolPanel");if(panel){panel.style.display="none";panel.innerHTML=""}const workspace=document.getElementById("toolsWorkspace");workspace?.removeAttribute("hidden");draw();if(!favorisChargementFait)chargerFavorisPartages()}
  function grouped(rows,key,subtitle){const groups=[...new Set(rows.map(key))];return `<div class="tools-hero"><h2>Outils</h2><p>${subtitle}</p></div>${groups.map(g=>`<section class="tools-section"><div class="tools-section-head"><h3>${esc(g)}</h3><span>${rows.filter(x=>key(x)===g).length}</span></div><div class="tools-layout-grid">${rows.filter(x=>key(x)===g).map(toolCard).join("")}</div></section>`).join("")}`}
  function openWorkspaceTool(id){globalThis.EpsToolActivity=activity;if(id.startsWith("eps-test:")){const key=id.slice(9),category=globalThis.EpsTests?.CATEGORIES?.find(c=>c.tests.includes(key));epsOpenCategory=category?.name||"Athle";epsOpenTest=key;openTool("tests");return}if(id==="tests"){epsOpenCategory=null;epsOpenTest=null}openTool(id)}
  function bind(host){host.querySelectorAll("[data-activity]").forEach(b=>b.onclick=()=>{activity=b.dataset.activity;draw()});host.querySelector("#toolsActivityBack")?.addEventListener("click",()=>{activity=null;draw()});host.querySelector("#toolsFavoritesBack")?.addEventListener("click",()=>{showFavorites=false;draw()});host.querySelector("#toolsFavoritesShortcut")?.addEventListener("click",()=>{showFavorites=true;activity=null;draw()});host.querySelectorAll("[data-favorite-tool]").forEach(b=>b.onclick=e=>{e.stopPropagation();toggleFavoriteId(b.dataset.favoriteTool);draw()});host.querySelectorAll("[data-open-modern]").forEach(b=>b.onclick=()=>openWorkspaceTool(b.dataset.openModern));host.querySelector("#toolsSearch")?.addEventListener("input",e=>{query=e.target.value;draw()})}
  function header(title,sub,icon){return toolHeader(`${icon} ${esc(title)}`,esc(sub))}
  // Un seul selecteur "Usage libre (sans classe)" + les classes, exactement comme dans 3x500m
  // (toolRosterHtml/bindToolRoster dans outils.js) : plus de paire Utilisation/Classe a part.
  // #modernMode reste en place, cache, pour que renderRandomWeb/renderAcrosportWeb/saveWork
  // qui le lisent directement continuent de fonctionner sans etre touches.
  async function contextHtml(){await loadToolClasses();return `<div class="tool-context"><input type="hidden" id="modernMode" value="free"><select id="modernClass"><option value="">Usage libre (sans classe)</option>${toolClasses.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div><div class="field-tool-row"><label>Période<select id="modernPeriod">${[1,2,3,4,5].map(p=>`<option value="${p}">P${p}</option>`).join("")}</select></label></div>`}
  function bindContext(after){const mode=document.getElementById("modernMode"),cls=document.getElementById("modernClass");if(!cls)return;cls.onchange=async()=>{mode.value=cls.value?"class":"free";toolClassId=cls.value||FREE_USE;await loadToolStudents(toolClassId);const period=document.getElementById("modernPeriod"),c=toolClasses.find(c=>c.id===cls.value),n=c?planningPeriodCount(c.grade):5;if(period){const old=+period.value||1;period.innerHTML=Array.from({length:n},(_,i)=>`<option value="${i+1}">P${i+1}</option>`).join("");period.value=String(Math.min(old,n))}after?.()}}
  async function restoreContext(saved,after){const mode=document.getElementById("modernMode"),cls=document.getElementById("modernClass"),period=document.getElementById("modernPeriod");if(!cls)return;cls.value=saved?.classId||"";mode.value=cls.value?"class":"free";toolClassId=cls.value||FREE_USE;await loadToolStudents(toolClassId);const c=toolClasses.find(c=>c.id===cls.value),n=c?planningPeriodCount(c.grade):5;if(period){period.innerHTML=Array.from({length:n},(_,i)=>`<option value="${i+1}">P${i+1}</option>`).join("");period.value=String(Math.min(saved?.period||1,n))}after?.()}
  async function saveWork(type,title,payload,context){
    const mode=document.getElementById("modernMode")?.value||"free",classId=document.getElementById("modernClass")?.value||null,
      period=+(document.getElementById("modernPeriod")?.value||1),id=payload.id||crypto.randomUUID(),now=new Date().toISOString(),
      createdAt=payload.createdAt||now,finalClassId=context?context.classId:(mode==="class"?classId:null),finalPayload={...payload,id:undefined,createdAt:undefined};
    await enregistrerLigne("eps_saved_tool_works",{
      id,user_id:session.user_id,type,title:title||"Travail",payload:JSON.stringify(finalPayload),
      class_id:finalClassId,period_number:context?.period||period,created_at:createdAt,updated_at:now,deleted:false
    });
    return {id,type,title:title||"Travail",classId:finalClassId,period:context?.period||period,payload:finalPayload,createdAt,updatedAt:now};
  }
  function workList(){return ""}
  function bindWorks(type,rerender,load){openWorkLibrary(type,"Mes travaux",load)}
  function closeWorkLibrary(){document.getElementById("toolWorkOverlay")?.remove()}
  async function openWorkLibrary(type,title,load){
    closeWorkLibrary();
    const overlayChargement=document.createElement("div");overlayChargement.id="toolWorkOverlay";overlayChargement.className="tool-work-overlay";
    overlayChargement.innerHTML=`<section class="tool-work-sheet"><header><button class="tool-work-back" id="toolWorkClose">←</button><div><small>TRAVAUX ENREGISTRÉS</small><h2>${esc(title)}</h2></div></header><main><div class="tool-work-empty"><i>▤</i><strong>Chargement…</strong></div></main></section>`;
    document.body.appendChild(overlayChargement);requestAnimationFrame(()=>overlayChargement.classList.add("open"));
    toolWorkClose.onclick=closeWorkLibrary;overlayChargement.onclick=e=>{if(e.target===overlayChargement)closeWorkLibrary()};
    const rows=(await readWorks()).filter(x=>x.type===type).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const overlay=document.getElementById("toolWorkOverlay");
    if(!overlay)return; // Ferme entre-temps.
    overlay.innerHTML=`<section class="tool-work-sheet"><header><button class="tool-work-back" id="toolWorkClose">←</button><div><small>TRAVAUX ENREGISTRÉS</small><h2>${esc(title)}</h2><p>Ouvrir un travail permet de le consulter et de le modifier.</p></div><b>${rows.length}</b></header><main>${rows.length?rows.map(w=>`<article class="tool-work-item"><button class="tool-work-open" data-work-open-full="${w.id}"><i>▤</i><span><strong>${esc(w.title)}</strong><small>${w.classId?"Avec une classe":"Utilisation libre"} · Période ${w.period} · modifié le ${new Date(w.updatedAt).toLocaleDateString("fr-FR")}</small></span><em>›</em></button><button class="tool-work-more" data-work-more="${w.id}" aria-label="Actions">⋮</button></article>`).join(""):`<div class="tool-work-empty"><i>▤</i><strong>Aucun travail enregistré</strong><span>Après un enregistrement, votre travail apparaîtra ici.</span></div>`}</main></section>`;
    toolWorkClose.onclick=closeWorkLibrary;overlay.onclick=e=>{if(e.target===overlay)closeWorkLibrary()};
    overlay.querySelectorAll("[data-work-open-full]").forEach(b=>b.onclick=()=>{const w=rows.find(x=>x.id===b.dataset.workOpenFull);if(w){closeWorkLibrary();load(w)}});
    overlay.querySelectorAll("[data-work-more]").forEach(b=>b.onclick=()=>{const w=rows.find(x=>x.id===b.dataset.workMore);if(!w)return;const main=overlay.querySelector("main");main.innerHTML=`<div class="tool-work-actions-card"><i>▤</i><h3>${esc(w.title)}</h3><p>Choisissez l’action à effectuer sur ce travail.</p><button id="toolWorkEdit">✎ Ouvrir et modifier</button><button class="secondary" id="toolWorkCopy">▣ Dupliquer</button><button class="danger" id="toolWorkDelete">⌫ Supprimer</button><button class="secondary" id="toolWorkCancel">Annuler</button></div>`;toolWorkEdit.onclick=()=>{closeWorkLibrary();load(w)};toolWorkCopy.onclick=async()=>{await saveWork(type,w.title+" · copie",{...w.payload,id:undefined},w);closeWorkLibrary();openWorkLibrary(type,title,load)};toolWorkDelete.onclick=()=>{main.innerHTML=`<div class="tool-work-actions-card danger-card"><i>⌫</i><h3>Supprimer ce travail ?</h3><p>${esc(w.title)} sera supprimé.</p><button class="danger" id="toolWorkConfirmDelete">Supprimer (restaurable)</button><button class="secondary" id="toolWorkCancelDelete">Conserver</button></div>`;toolWorkConfirmDelete.onclick=async()=>{await enregistrerLigne("eps_saved_tool_works",{...w._raw,deleted:true,updated_at:new Date().toISOString()});closeWorkLibrary();await openWorkLibrary(type,title,load);EpsToolWorkflow.offerUndo(async()=>{await enregistrerLigne("eps_saved_tool_works",{...w._raw,deleted:false,updated_at:new Date().toISOString()});closeWorkLibrary();await openWorkLibrary(type,title,load)},document.querySelector("#toolWorkOverlay main"))};toolWorkCancelDelete.onclick=()=>{closeWorkLibrary();openWorkLibrary(type,title,load)}};toolWorkCancel.onclick=()=>{closeWorkLibrary();openWorkLibrary(type,title,load)}})
  }
  function askWorkName(defaultValue,onSave){
    document.getElementById("toolSaveOverlay")?.remove();const overlay=document.createElement("div");overlay.id="toolSaveOverlay";overlay.className="tool-work-overlay";overlay.innerHTML=`<section class="tool-save-sheet"><header><i>💾</i><div><small>ENREGISTRER</small><h2>Nommer le travail</h2></div><button id="toolSaveClose">×</button></header><label>Nom du travail<input id="toolSaveName" value="${esc(defaultValue)}" maxlength="80"></label><div><button id="toolSaveConfirm">Enregistrer</button><button class="secondary" id="toolSaveCancel">Annuler</button></div></section>`;document.body.appendChild(overlay);requestAnimationFrame(()=>overlay.classList.add("open"));const close=()=>overlay.remove();toolSaveClose.onclick=toolSaveCancel.onclick=close;toolSaveConfirm.onclick=()=>{const name=toolSaveName.value.trim();if(!name){toolSaveName.focus();return}close();onSave(name)};toolSaveName.focus();toolSaveName.select();toolSaveName.onkeydown=e=>{if(e.key==="Enter")toolSaveConfirm.click()}
  }
  function download(name,text,type="text/plain"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
  async function renderMultiChronoWeb(saved){
    const savedSession=saved?.session||null,savedResults=saved?.results||[];
    if(!savedSession){toolClassId=FREE_USE;await loadToolStudents(toolClassId)}
    if(savedSession?.class_id){toolClassId=savedSession.class_id;await loadToolStudents(toolClassId)}
    const ctx=await contextHtml();
    // Le Multi-chrono reprend la logique du 3 x 500 : toute la classe reste disponible dans
    // "Sans groupe", puis l'enseignant peut créer, modifier ou supprimer ses groupes. Les
    // chronos sont indexes par eleve afin qu'un changement de groupe ne perde jamais un temps.
    let groups=[],activeGroup=-1,manageGroups=false,editingGroup=null,selection=new Set(),freeCounter=1;
    let timers=new Map(),workspace=null,sessionId=savedSession?.id||null,sessionRecord=savedSession,
      resultRecords=Object.fromEntries(savedResults.map(r=>[String(r.student_id),r]));
    const makeTimer=(id,name)=>({id:String(id),name,ms:0,running:false,start:0});
    const resetTimersFromContext=()=>{
      groups=[];activeGroup=-1;manageGroups=false;editingGroup=null;selection=new Set();freeCounter=1;
      sessionId=null;sessionRecord=null;resultRecords={};
      timers=new Map(onRealClass()&&toolStudents.length
        ? toolStudents.map(e=>[String(e.id),makeTimer(e.id,studentLabel(e))])
        : [["free-1",makeTimer("free-1","Élève 1")]]);
    };
    const currentTimers=()=>{
      const all=[...timers.values()];
      if(!onRealClass()||activeGroup<0)return all.sort((a,b)=>a.name.localeCompare(b.name,"fr",{sensitivity:"base"}));
      const ids=new Set(groups[activeGroup]||[]);return all.filter(t=>ids.has(t.id));
    };
    const groupsHtml=()=>{
      if(!onRealClass())return "";
      const tabs=`<div class="running-group-tabs"><button class="${activeGroup<0?'':'secondary'}" data-multi-group="-1">Sans groupe · ordre alphabétique</button>${groups.map((g,i)=>`<button class="${activeGroup===i?'':'secondary'}" data-multi-group="${i}">Groupe ${i+1} · ${g.length}</button>`).join('')}<button class="secondary" id="multiManageGroups">${groups.length?'Modifier les groupes':'Constituer des groupes'}</button></div>`;
      if(!manageGroups)return tabs;
      const unavailable=new Set(groups.flatMap((g,i)=>i===editingGroup?[]:g));
      const editor=`<section class="running-group-editor"><div class="top"><div><b>${editingGroup==null?`Créer le groupe ${groups.length+1}`:`Modifier le groupe ${editingGroup+1}`}</b><small>Cochez les élèves puis enregistrez la composition.</small></div><button class="secondary" id="multiCloseGroups">Fermer</button></div><div class="running-group-students">${toolStudents.filter(s=>!unavailable.has(String(s.id))).map(s=>`<label class="${selection.has(String(s.id))?'selected':''}"><input type="checkbox" data-multi-group-student="${s.id}" ${selection.has(String(s.id))?'checked':''}><span>${esc(studentLabel(s))}</span></label>`).join('')}</div><div class="running-group-actions"><button id="multiSaveGroup" ${selection.size?'':'disabled'}>${editingGroup==null?'Créer le groupe':'Enregistrer les modifications'}</button>${editingGroup!=null?'<button class="danger" id="multiDeleteGroup">Supprimer ce groupe</button>':''}</div><div class="running-existing-groups">${groups.map((g,i)=>`<button class="secondary" data-multi-edit-group="${i}">Groupe ${i+1} · ${g.length} élève(s)</button>`).join('')}</div></section>`;
      return tabs+editor;
    };
    const elapsed=t=>t.ms+(t.running?Date.now()-t.start:0);
    const draw=()=>{
      const rows=currentTimers();
      const work=`<div class="multi-chrono-table-wrap"><table class="multi-chrono-table"><thead><tr><th>Nom et prénom</th><th>Chrono</th><th>Actions</th></tr></thead><tbody>${rows.map(t=>`<tr><th>${onRealClass()?esc(t.name):`<input data-multi-name="${t.id}" value="${esc(t.name)}" aria-label="Nom du participant">`}</th><td><b data-multi-time="${t.id}">${formatToolTime(elapsed(t))}</b></td><td><div class="multi-chrono-actions"><button data-multi-toggle="${t.id}">${t.running?'Pause':'Départ'}</button><button class="secondary" data-multi-reset="${t.id}">↺ Remettre à zéro</button></div></td></tr>`).join('')||'<tr><td colspan="3" class="muted">Ce groupe ne contient aucun élève.</td></tr>'}</tbody></table></div>${!onRealClass()?'<button class="secondary" id="multiAdd">＋ Ajouter un chrono</button>':''}<div class="running-save-actions">${onRealClass()?`<button id="multiSave">💾 ${sessionId?'Enregistrer les modifications':'Enregistrer dans Tests EPS'}</button><button class="secondary" id="multiSaveAs">Enregistrer comme nouveau test</button>`:''}<button class="danger" id="multiResetAll">↺ Réinitialiser les résultats</button></div><div class="running-save-actions">${!onRealClass()?'<button id="multiFreeSave">💾 Enregistrer</button>':''}<button id="multiResume" class="secondary">↻ Reprendre</button><button id="multiExport" class="secondary">▦ Exporter</button></div><div id="multiLibrary"></div><div id="multiSaveMsg" class="ok"></div>`;
      workspace.innerHTML=`${groupsHtml()}${manageGroups?'':work}`;
      bindDrawn();
    };
    const bindDrawn=()=>{
      if(onRealClass()) {const library=EpsClassGroups.fromArrays(toolClassId,groups);workspace.insertAdjacentHTML('afterbegin',EpsClassGroups.controls(library));EpsClassGroups.bind(library,toolStudents,()=>{groups=EpsClassGroups.arrays(library);activeGroup=-1;draw()})}
      workspace.querySelector('#multiExport')?.addEventListener('click',()=>EpsToolWorkflow.csv('multi-chrono.csv',[['Élève','Groupe','Temps (s)'],...[...timers.values()].map(t=>[t.name,groups.findIndex(g=>g.includes(t.id))+1||'',+(elapsed(t)/1000).toFixed(2)])]));
      workspace.querySelector('#multiFreeSave')?.addEventListener('click',async()=>{const title=prompt('Nom du travail','Multi-chrono libre');if(!title)return;try{const w=await saveWork('multi-free',title,{id:saved?.freeWork?.id,timers:[...timers.values()].map(t=>({...t,ms:elapsed(t),running:false,start:0}))},{classId:null,period:+document.getElementById('modernPeriod').value});document.getElementById('multiSaveMsg').textContent='Enregistré dans Mes travaux.';saved={freeWork:w}}catch(e){document.getElementById('multiSaveMsg').textContent='Enregistrement impossible : '+e.message}});
      workspace.querySelector('#multiResume')?.addEventListener('click',async()=>{try{const rows=await lireTable('eps_test_sessions','eps_test_sessions?deleted=eq.false&test_name=eq.Multi-chrono&select=*&order=created_at.desc',{ou:r=>!r.deleted&&r.test_name==='Multi-chrono'}),host=workspace.querySelector('#multiLibrary');host.innerHTML=`<section class="field-tool-card"><h3>Multi-chronos enregistrés</h3>${rows.filter(r=>r.test_name==='Multi-chrono'&&r.user_id===session.user_id).map(r=>`<button data-multi-open="${esc(r.id)}">${esc(r.class_label)} · P${r.period_number} · ${new Date(r.created_at).toLocaleDateString('fr-FR')}</button>`).join('')}<button id="multiFreeLibrary" class="secondary">Travaux en usage libre</button></section>`;host.querySelectorAll('[data-multi-open]').forEach(b=>b.onclick=()=>{const r=rows.find(r=>r.id===b.dataset.multiOpen);ouvrirMultiChronoDepuisClasse(r.id,r.class_id,r.period_number)});host.querySelector('#multiFreeLibrary').onclick=()=>openWorkLibrary('multi-free','Multi-chronos libres',w=>renderMultiChronoWeb({freeWork:w}))}catch(e){document.getElementById('multiSaveMsg').textContent=e.message}});
      workspace.querySelectorAll('[data-multi-group]').forEach(b=>b.onclick=()=>{activeGroup=+b.dataset.multiGroup;manageGroups=false;draw()});
      workspace.querySelector('#multiManageGroups')?.addEventListener('click',()=>{manageGroups=true;editingGroup=null;selection=new Set();draw()});
      workspace.querySelector('#multiCloseGroups')?.addEventListener('click',()=>{manageGroups=false;draw()});
      workspace.querySelectorAll('[data-multi-group-student]').forEach(box=>box.onchange=()=>{box.checked?selection.add(String(box.dataset.multiGroupStudent)):selection.delete(String(box.dataset.multiGroupStudent));box.closest('label')?.classList.toggle('selected',box.checked);const save=workspace.querySelector('#multiSaveGroup');if(save)save.disabled=!selection.size});
      workspace.querySelectorAll('[data-multi-edit-group]').forEach(b=>b.onclick=()=>{editingGroup=+b.dataset.multiEditGroup;selection=new Set(groups[editingGroup]||[]);draw()});
      workspace.querySelector('#multiSaveGroup')?.addEventListener('click',()=>{const ids=[...selection];if(!ids.length)return;if(editingGroup==null)groups.push(ids);else groups[editingGroup]=ids;activeGroup=editingGroup==null?groups.length-1:editingGroup;manageGroups=false;editingGroup=null;selection=new Set();draw()});
      workspace.querySelector('#multiDeleteGroup')?.addEventListener('click',()=>{if(!confirm(`Supprimer le groupe ${editingGroup+1} ? Les chronos restent conservés.`))return;const previous=structuredClone(groups),active=activeGroup;groups.splice(editingGroup,1);activeGroup=groups.length?Math.min(editingGroup,groups.length-1):-1;manageGroups=false;editingGroup=null;selection=new Set();draw();EpsToolWorkflow.offerUndo(()=>{groups=previous;activeGroup=active;draw()})});
      workspace.querySelectorAll('[data-multi-toggle]').forEach(b=>b.onclick=()=>{const t=timers.get(b.dataset.multiToggle);if(!t)return;if(t.running){t.ms+=Date.now()-t.start;t.running=false}else{t.start=Date.now();t.running=true}draw()});
      workspace.querySelectorAll('[data-multi-reset]').forEach(b=>b.onclick=()=>{const t=timers.get(b.dataset.multiReset);if(!t)return;t.ms=0;t.running=false;t.start=0;draw()});
      workspace.querySelectorAll('[data-multi-name]').forEach(input=>input.onchange=()=>{const t=timers.get(input.dataset.multiName);if(t)t.name=input.value.trim()||t.name});
      workspace.querySelector('#multiAdd')?.addEventListener('click',()=>{freeCounter++;const t=makeTimer(`free-${freeCounter}`,`Élève ${freeCounter}`);timers.set(t.id,t);draw()});
      workspace.querySelector('#multiSave')?.addEventListener('click',()=>saveMultiChrono(false));
      workspace.querySelector('#multiSaveAs')?.addEventListener('click',()=>saveMultiChrono(true));
      if(workspace.querySelector('#multiResetAll'))workspace.querySelector('#multiResetAll').textContent='↺ Réinitialiser les résultats';
      workspace.querySelector('#multiResetAll')?.addEventListener('click',()=>{if(!confirm('Remettre les chronos à zéro ? Les groupes et les tests enregistrés sont conservés.'))return;const previous=[...timers.values()].map(t=>({...t,ms:elapsed(t),running:false,start:0})),id=sessionId,record=sessionRecord,records=structuredClone(resultRecords);timers.forEach(t=>{t.ms=0;t.running=false;t.start=0});sessionId=null;sessionRecord=null;resultRecords={};draw();EpsToolWorkflow.offerUndo(()=>{timers=new Map(previous.map(t=>[t.id,t]));sessionId=id;sessionRecord=record;resultRecords=records;draw()})});
    };
    const restoreSaved=()=>{
      groups=[];const groupMap=new Map();
      timers=new Map(toolStudents.map(e=>[String(e.id),makeTimer(e.id,studentLabel(e))]));
      savedResults.forEach(r=>{const timer=timers.get(String(r.student_id));if(!timer)return;timer.ms=Math.max(0,+r.input_value||0);let meta={};try{const raw=String(r.input_unit||'');if(raw.startsWith('multi-chrono|'))meta=JSON.parse(raw.slice(13))}catch{}const group=Number(meta.group);if(Number.isInteger(group)&&group>=0){if(!groupMap.has(group))groupMap.set(group,[]);groupMap.get(group).push(String(r.student_id))}});
      groups=[...groupMap.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]);activeGroup=groups.length?0:-1;
    };
    const saveMultiChrono=async asNew=>{
      if(!onRealClass())return alert('Choisissez une classe pour enregistrer ce test.');
      const button=workspace.querySelector('#multiSave');if(button)button.disabled=true;
      const now=new Date().toISOString(),id=asNew||!sessionId?crypto.randomUUID():sessionId,
        cls=toolClasses.find(c=>String(c.id)===String(toolClassId)),period=+(document.getElementById('modernPeriod')?.value||1),
        sessionRow=asNew||!sessionRecord?{id,user_id:session.user_id,class_id:toolClassId,period_number:period,test_name:'Multi-chrono',created_at:Date.now(),class_label:cls?.name||'',updated_at:now,deleted:false}:{...sessionRecord,period_number:period,updated_at:now,deleted:false};
      try{
        await enregistrerLigne('eps_test_sessions',sessionRow);const kept=new Set();
        for(const student of toolStudents){const timer=timers.get(String(student.id))||makeTimer(student.id,studentLabel(student));if(timer.running){timer.ms+=Date.now()-timer.start;timer.running=false;timer.start=0}const old=asNew?null:resultRecords[String(student.id)],resultId=old?.id||crypto.randomUUID(),group=groups.findIndex(g=>g.includes(String(student.id)));kept.add(String(resultId));await enregistrerLigne('eps_test_results',{...(old||{}),id:resultId,user_id:old?.user_id||session.user_id,session_id:id,student_id:student.id,input_value:Math.round(timer.ms),result_value:+(timer.ms/1000).toFixed(2),input_unit:`multi-chrono|${JSON.stringify({group})}`,result_unit:'s',updated_at:now,deleted:false});resultRecords[String(student.id)]={...(old||{}),id:resultId,student_id:student.id}}
        if(!asNew)for(const old of Object.values(resultRecords))if(old?.id&&!kept.has(String(old.id)))await enregistrerLigne('eps_test_results',{...old,deleted:true,updated_at:now});
        sessionId=id;sessionRecord=sessionRow;draw();const msg=document.getElementById('multiSaveMsg');if(msg)msg.textContent=asNew?'Nouveau test enregistré dans la classe.':'Test enregistré dans la classe.';
      }catch(error){const msg=document.getElementById('multiSaveMsg');if(msg)msg.textContent=`Enregistrement impossible : ${error.message||error}`;if(button)button.disabled=false}
    };
    toolPanel.innerHTML=header("Multi-chrono","Groupes et chronos par élève","⏱️")+`<main class="field-tool-card">${ctx}<div id="multiWorkspace"></div></main>`;
    workspace=document.getElementById('multiWorkspace');
    if(savedSession?.class_id){const cls=document.getElementById('modernClass'),mode=document.getElementById('modernMode'),period=document.getElementById('modernPeriod');cls.value=savedSession.class_id;mode.value='class';period.value=String(savedSession.period_number||1);restoreSaved()}else {resetTimersFromContext();if(saved?.freeWork){timers=new Map((saved.freeWork.payload.timers||[]).map(t=>[t.id,{...t,running:false,start:0}]));freeCounter=Math.max(timers.size,1)}}
    draw();
    const ticker=setInterval(()=>{const host=document.getElementById('multiWorkspace');if(!host||host!==workspace){clearInterval(ticker);return}host.querySelectorAll('[data-multi-time]').forEach(node=>{const t=timers.get(node.dataset.multiTime);if(t?.running)node.textContent=formatToolTime(elapsed(t))})},100);
    bindContext(()=>{resetTimersFromContext();draw()})}

  async function ouvrirMultiChronoDepuisClasse(sessionId,classId,period){
    showTab('outils');toolPanel=document.getElementById('toolPanel');toolPanel.style.display='block';toolPanel.classList.add('modern-tool-panel');toolClassId=classId;
    const sessions=await lireTable('eps_test_sessions',`eps_test_sessions?id=eq.${sessionId}&deleted=eq.false&select=*`,{ou:r=>String(r.id)===String(sessionId)&&!r.deleted}),
      results=await lireTable('eps_test_results',`eps_test_results?session_id=eq.${sessionId}&deleted=eq.false&select=*`,{ou:r=>String(r.session_id)===String(sessionId)&&!r.deleted}),
      sessionRow=sessions[0]||{id:sessionId,class_id:classId,period_number:+period||1,test_name:'Multi-chrono',created_at:Date.now(),class_label:toolClasses.find(c=>String(c.id)===String(classId))?.name||'',deleted:false};
    await renderMultiChronoWeb({session:sessionRow,results});
  }
  function homeFavoriteToolSummary(){const rows=favoriteTools();return {count:rows.length,title:rows[0]?.title||"Mes favoris"}}
  function ouvrirFavorisDepuisAccueil(){showTab("outils");showFavorites=true;activity=null;draw()}
  const fr=(v,d=1)=>Number(v).toFixed(d).replace(".",",");
  // Chaque indicateur rapporte (+1) ou retire (-1) un point ; l'eleve part du milieu du bareme
  // choisi, plafonne entre 0 et le bareme - un jeu reussi fait monter la note, une succession
  // de fautes la fait descendre, sans jamais sortir de l'intervalle.
  const OBS_PRESETS={
    "Basket-ball":[["Tir réussi",1],["Tir raté",-1],["Passe décisive",1],["Balle perdue",-1],["Récupération",1]],
    "Football / Handball":[["But",1],["Tir cadré",1],["Passe réussie",1],["Perte de balle",-1],["Récupération",1]],
    "Volley-ball":[["Service réussi",1],["Réception réussie",1],["Renvoi",1],["Point direct",1],["Faute",-1]],
    "Badminton":[["Service réussi",1],["Varié",1],["Faute directe",-1],["Smash / amorti",1],["Variation de jeu",1],["Pas de replacement",-1]],
    "Rugby":[["Plaquage réussi",1],["Plaquage raté",-1],["Passe réussie",1],["Perte de balle",-1],["Balle en avant",-1]],
    "Gymnastique / Acrosport":[["Figure réussie",1],["Figure non validée",-1],["Liaison fluide",1],["Aide / parade efficace",1],["Déséquilibre ou chute",-1],["Consigne de sécurité respectée",1]]
  };
  function obsRaw(state,studentId){const v=state.values[studentId]||{};return state.indicators.reduce((somme,[label,pol])=>somme+(v[label]||0)*pol,0)}
  function obsNote(state,studentId){return Math.min(state.bareme,Math.max(0,state.bareme/2+obsRaw(state,studentId)))}
  async function renderObserverWeb(saved){
    const ctx=await contextHtml();
    // Une ancienne observation (avant ce redessin) comptait un seul total global, sans eleve ni
    // bareme : on ne peut pas la relire telle quelle, mais on garde son titre et on repart d'un
    // etat neuf plutot que de planter sur un format qui n'existe plus.
    const compatible=saved?.payload&&Array.isArray(saved.payload.indicators);
    const initialSport=globalThis.EpsToolActivity==="Raquettes"?"Badminton":"Basket-ball";
    const state=compatible?structuredClone(saved.payload):{sport:initialSport,bareme:20,indicators:structuredClone(OBS_PRESETS[initialSport]),values:{},activeId:null};
    state.groups??=[];state.assignments??={};state.activeGroup??='';
    let id=saved?.id;
    const tousEleves=()=>onRealClass()?toolStudents:[{id:FREE_USE,first_name:"Participant",last_name:"libre"}];
    const eleves=()=>EpsToolWorkflow.visible(state,tousEleves());
    // Tout se lit d'un coup : la colonne des eleves reste en vue, un indicateur par colonne.
    // Auparavant il fallait choisir un eleve pour voir ses indicateurs apparaitre plus bas, et
    // l'on perdait de vue le reste de la classe a chaque changement.
    const tableauHtml=()=>{
      const liste=eleves();
      if(!liste.length)return `<p class="muted">Choisissez une classe pour observer ses élèves, ou restez en usage libre pour un seul participant.</p>`;
      return `<div class="fitness-web">${socleTableauHtml(
        state.indicators.map(([label,pol])=>({titre:label,aide:pol>0?"+1":"−1"})),
        liste.map(e=>{const v=state.values[e.id]||{};return {eleve:e,
          cellules:state.indicators.map(([label])=>`<span class="obs-cell"><button type="button" data-obs-dec="${esc(label)}" data-obs-for="${e.id}">−</button><b>${v[label]||0}</b><button type="button" data-obs-inc="${esc(label)}" data-obs-for="${e.id}">＋</button></span>`),
          total:`${fr(obsNote(state,e.id))} / ${state.bareme}`}}),
        "Note")}</div>`;
    };
    toolPanel.innerHTML=header("Observateur","Compter les actions sans quitter le jeu, par élève","👁️")+
      `<main class="field-tool-card">${ctx}
        <div class="field-tool-row">
          <label>Sport<select id="obsSport">${Object.keys(OBS_PRESETS).map(s=>`<option value="${esc(s)}"${s===state.sport?" selected":""}>${esc(s)}</option>`).join("")}</select></label>
          <label>Barème<select id="obsBareme">${[5,10,20].map(b=>`<option value="${b}"${b===state.bareme?" selected":""}>/${b}</option>`).join("")}</select></label>
        </div>
        <div id="obsGroups"></div><div id="obsTable">${tableauHtml()}</div>
        <div class="field-tool-row"><input id="obsNew" placeholder="Nouvel indicateur"><select id="obsNewPol"><option value="1">Positif (+1)</option><option value="-1">Négatif (−1)</option></select><button id="obsAdd">Ajouter</button><button class="danger" id="obsReset">↺ Réinitialiser toutes les données</button></div>
      </main>
      <div class="tool-savebar"><button id="obsSave">💾 Enregistrer</button><button id="obsExport">▦ Exporter</button><button id="obsResume">↻ Reprendre</button></div>
      <div id="obsSaved"></div>`;
    const redraw=()=>{document.getElementById("obsTable").innerHTML=tableauHtml();bindTable()};
    function bindTable(){
      // Chaque bouton porte son eleve : plus besoin d'en designer un "actif" au prealable.
      document.querySelectorAll("[data-obs-inc]").forEach(el=>el.onclick=()=>{const l=el.dataset.obsInc,id=el.dataset.obsFor;const v=state.values[id]=state.values[id]||{};v[l]=(v[l]||0)+1;redraw()});
      document.querySelectorAll("[data-obs-dec]").forEach(el=>el.onclick=()=>{const l=el.dataset.obsDec,id=el.dataset.obsFor;const v=state.values[id]=state.values[id]||{};v[l]=Math.max(0,(v[l]||0)-1);redraw()});
    }
    bindTable();
    document.getElementById("obsSport").onchange=e=>{state.sport=e.target.value;state.indicators=OBS_PRESETS[state.sport];state.values={};state.activeId=null;redraw()};
    document.getElementById("obsBareme").onchange=e=>{state.bareme=+e.target.value;redraw()};
    document.getElementById("obsAdd").onclick=()=>{
      const nom=document.getElementById("obsNew").value.trim();if(!nom)return;
      state.indicators=[...state.indicators,[nom,+document.getElementById("obsNewPol").value]];
      document.getElementById("obsNew").value="";redraw()
    };
    document.getElementById("obsReset").onclick=()=>{if(!confirm("Effacer toutes les actions et les indicateurs personnalisés du travail en cours ? Les observations déjà enregistrées seront conservées."))return;id=null;state.values={};state.indicators=OBS_PRESETS[state.sport].map(x=>[...x]);state.activeId=null;state.groups=[];state.assignments={};state.activeGroup="";drawGroups();redraw()};
    document.getElementById("obsSave").onclick=async()=>{
      const name=prompt("Nom de l’observation",saved?.title||`Observation ${state.sport}`);if(!name)return;
      const button=document.getElementById('obsSave');button.disabled=true;
      try{const w=await saveWork("observer",name,{...state,id,createdAt:saved?.createdAt});id=w.id;await renderObserverWeb(w)}
      catch(e){alert('Enregistrement impossible : '+e.message);button.disabled=false}
    };
    document.getElementById("obsExport").onclick=()=>{
      const lignes=[["Élève",...state.indicators.map(([l])=>l),"Note"],
        ...tousEleves().map(e=>[studentLabel(e),...state.indicators.map(([l])=>String((state.values[e.id]||{})[l]||0)),`${fr(obsNote(state,e.id))}/${state.bareme}`])];
      download(`observation-${state.sport}.csv`,"\ufeff"+lignes.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(";")).join("\r\n"),"text/csv;charset=utf-8");
    };
    document.getElementById("obsResume").onclick=()=>{document.getElementById("obsSaved").innerHTML=workList("observer");bindWorks("observer",()=>renderObserverWeb(),renderObserverWeb)};
    const drawGroups=()=>{document.getElementById('obsGroups').innerHTML=EpsToolWorkflow.groupsHtml(state,tousEleves());EpsToolWorkflow.bindGroups(state,()=>{drawGroups();redraw()})};
    bindContext(()=>{drawGroups();redraw()});
    await restoreContext(saved,()=>{drawGroups();redraw()});
  }
  async function renderRandomWeb(){const ctx=await contextHtml();toolPanel.innerHTML=header("Tirage au sort","Un élève en un toucher","🎲")+`<main class="field-tool-card">${ctx}<div class="field-tool-card" id="randomResult" style="font-size:28px;text-align:center">Prêt</div><button id="randomGo">Tirer un élève</button></main>`;bindContext();document.getElementById("randomGo").onclick=async()=>{const mode=document.getElementById("modernMode"),cls=document.getElementById("modernClass"),result=document.getElementById("randomResult");if(mode.value==="class"&&!cls.value)return alert("Choisissez une classe.");await loadToolStudents(cls.value);result.textContent=toolStudents.length?studentLabel(toolStudents[Math.floor(Math.random()*toolStudents.length)]):`Participant ${1+Math.floor(Math.random()*99)}`}}
  async function renderEffortWeb(){const ctx=await contextHtml();toolPanel.innerHTML=header("Effort et intensité","Ressenti et zones cardiaques indicatives","❤️")+`<main class="field-tool-card">${ctx}<div class="field-tool-row"><label>Âge<input id="effAge" type=number min=5 max=100></label><label>Effort ressenti<input id="effRpe" type=range min=0 max=10 value=5></label></div><div class="field-tool-card" id="effResult">Complétez l’âge.</div></main>`;const calc=()=>{const age=+effAge.value,max=age?Math.round(208-.7*age):0;effResult.innerHTML=max?`<b>Effort ressenti : ${effRpe.value}/10</b><p>Zone modérée : ${Math.round(max*.6)}–${Math.round(max*.75)} bpm</p><p>Zone soutenue : ${Math.round(max*.75)}–${Math.round(max*.9)} bpm</p><small>Repères pédagogiques, sans valeur d’avis médical.</small>`:"Complétez l’âge."};effAge.oninput=effRpe.oninput=calc;bindContext()}
  function injectSettings(){const body=document.getElementById("settingsBody");if(!body||document.getElementById("toolsLayoutSection"))return;const current=localStorage.getItem(prefKey)||"activities";body.insertAdjacentHTML("beforeend",`<details class="card settingsSection" id="toolsLayoutSection"><summary>Organisation des outils</summary><div class="settingsContents"><p>Choisissez la présentation utilisée dans l’onglet Outils.</p>${Object.entries(layouts).map(([k,v])=>`<label class="trash-row"><span><b>${esc(v)}</b></span><input type=radio name=toolsLayout value="${k}" ${k===current?"checked":""}></label>`).join("")}</div></details><details class="card settingsSection" id="webTrashSection"><summary>Corbeille</summary><div class="settingsContents"><button id="loadWebTrash">Afficher les éléments supprimés</button><div id="webTrashRows"></div></div></details>`);body.querySelectorAll("[name=toolsLayout]").forEach(r=>r.onchange=()=>{localStorage.setItem(prefKey,r.value);activity=null;draw()});document.getElementById("loadWebTrash").onclick=loadTrash}
  async function loadTrash(){const host=document.getElementById("webTrashRows"),tables=[["classes","Classe","name"],["students","Élève","last_name"],["evaluations","Évaluation","label"],["class_documents","Document","title"],["eps_saved_tool_works","Travail outil","title"]];host.innerHTML="<p>Chargement…</p>";const all=[];for(const [table,kind,label] of tables){try{const rows=await lireTable(table,`${table}?deleted=eq.true&select=*&order=updated_at.desc`);rows.forEach(row=>all.push({table,kind,label:row[label]||kind,row}))}catch{}}host.innerHTML=all.length?all.map((x,i)=>`<div class="trash-row"><span><b>${esc(x.kind)}</b><br>${esc(x.label)}</span><button data-restore="${i}">Restaurer</button></div>`).join(""):"<p class=muted>La corbeille est vide.</p>";host.querySelectorAll("[data-restore]").forEach(b=>b.onclick=async()=>{const x=all[+b.dataset.restore];await enregistrerLigne(x.table,{...x.row,deleted:false,updated_at:new Date().toISOString()});loadTrash()})}
  const previousOpen=globalThis.openSettings;globalThis.openSettings=async function(){if(typeof previousOpen==="function")await previousOpen();injectSettings()};
  globalThis.EpsToolWorks={read:readWorks,save:saveWork,library:openWorkLibrary,download,restoreContext};
  Object.assign(globalThis,{renderMultiChronoWeb,ouvrirMultiChronoDepuisClasse,renderObserverWeb,renderRandomWeb,renderEffortWeb,resetToolsWorkspace,
    homeFavoriteToolSummary,ouvrirFavorisDepuisAccueil,
    isToolFavorite:id=>readFavorites().has(id),toggleToolFavorite:id=>{const active=toggleFavoriteId(id);draw();return active}});
  addEventListener("DOMContentLoaded",draw);
})();
