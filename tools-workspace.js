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
    ["observer","Observateur","Compter et analyser les actions","👁️","Observer",["Sports collectifs","Raquettes","Gymnastique","Escalade"]],
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
    ["impacts","Marqueur d’impacts","Zones jouées sur le terrain","🎯","Observer",["Sports collectifs","Raquettes"]],
    ["effort","Effort","Ressenti et zones d’intensité","❤️","Évaluer",["Athlétisme"]],
    ["signals","Signaux sonores","Départs et rotations","🔊","Terrain",["Tous"]],
    ["acrosport","Groupes Acrosport","Binômes, trinômes et groupes","🤸","Organiser",["Gymnastique"]]
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
  const worksKey=()=>`eps_tool_works:${account()}`;
  const readWorks=()=>{try{return JSON.parse(localStorage.getItem(worksKey())||"[]")}catch{return[]}};
  const writeWorks=v=>localStorage.setItem(worksKey(),JSON.stringify(v.slice(0,250)));
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
  function openWorkspaceTool(id){if(id.startsWith("eps-test:")){const key=id.slice(9),category=globalThis.EpsTests?.CATEGORIES?.find(c=>c.tests.includes(key));epsOpenCategory=category?.name||"Athle";epsOpenTest=key;openTool("tests");return}if(id==="tests"){epsOpenCategory=null;epsOpenTest=null}openTool(id)}
  function bind(host){host.querySelectorAll("[data-activity]").forEach(b=>b.onclick=()=>{activity=b.dataset.activity;draw()});host.querySelector("#toolsActivityBack")?.addEventListener("click",()=>{activity=null;draw()});host.querySelector("#toolsFavoritesBack")?.addEventListener("click",()=>{showFavorites=false;draw()});host.querySelector("#toolsFavoritesShortcut")?.addEventListener("click",()=>{showFavorites=true;activity=null;draw()});host.querySelectorAll("[data-favorite-tool]").forEach(b=>b.onclick=e=>{e.stopPropagation();toggleFavoriteId(b.dataset.favoriteTool);draw()});host.querySelectorAll("[data-open-modern]").forEach(b=>b.onclick=()=>openWorkspaceTool(b.dataset.openModern));host.querySelector("#toolsSearch")?.addEventListener("input",e=>{query=e.target.value;draw()})}
  function header(title,sub,icon){return toolHeader(`${icon} ${esc(title)}`,esc(sub))}
  // Un seul selecteur "Usage libre (sans classe)" + les classes, exactement comme dans 3x500m
  // (toolRosterHtml/bindToolRoster dans outils.js) : plus de paire Utilisation/Classe a part.
  // #modernMode reste en place, cache, pour que renderRandomWeb/renderAcrosportWeb/saveWork
  // qui le lisent directement continuent de fonctionner sans etre touches.
  async function contextHtml(){await loadToolClasses();return `<div class="tool-context"><input type="hidden" id="modernMode" value="free"><select id="modernClass"><option value="">Usage libre (sans classe)</option>${toolClasses.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div><div class="field-tool-row"><label>Période<select id="modernPeriod">${[1,2,3,4,5].map(p=>`<option value="${p}">P${p}</option>`).join("")}</select></label></div>`}
  function bindContext(after){const mode=document.getElementById("modernMode"),cls=document.getElementById("modernClass");if(!cls)return;cls.onchange=async()=>{mode.value=cls.value?"class":"free";toolClassId=cls.value||FREE_USE;await loadToolStudents(toolClassId);after?.()}}
  function restoreContext(saved,after){if(!saved)return;setTimeout(async()=>{const mode=document.getElementById("modernMode"),cls=document.getElementById("modernClass"),period=document.getElementById("modernPeriod");if(period)period.value=String(saved.period||1);if(saved.classId&&mode&&cls){mode.value="class";cls.value=saved.classId;toolClassId=saved.classId;await loadToolStudents(saved.classId);after?.()}},0)}
  function saveWork(type,title,payload){const mode=document.getElementById("modernMode")?.value||"free",classId=document.getElementById("modernClass")?.value||null,period=+(document.getElementById("modernPeriod")?.value||1),rows=readWorks(),id=payload.id||crypto.randomUUID(),now=new Date().toISOString(),work={id,type,title:title||"Travail",classId:mode==="class"?classId:null,period,payload:{...payload,id:undefined},createdAt:payload.createdAt||now,updatedAt:now};writeWorks([work,...rows.filter(x=>x.id!==id)]);return work}
  function workList(){return ""}
  function bindWorks(type,rerender,load){openWorkLibrary(type,"Mes travaux",load)}
  function closeWorkLibrary(){document.getElementById("toolWorkOverlay")?.remove()}
  function openWorkLibrary(type,title,load){
    closeWorkLibrary();const rows=readWorks().filter(x=>x.type===type).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const overlay=document.createElement("div");overlay.id="toolWorkOverlay";overlay.className="tool-work-overlay";
    overlay.innerHTML=`<section class="tool-work-sheet"><header><button class="tool-work-back" id="toolWorkClose">←</button><div><small>TRAVAUX ENREGISTRÉS</small><h2>${esc(title)}</h2><p>Ouvrir un travail permet de le consulter et de le modifier.</p></div><b>${rows.length}</b></header><main>${rows.length?rows.map(w=>`<article class="tool-work-item"><button class="tool-work-open" data-work-open-full="${w.id}"><i>▤</i><span><strong>${esc(w.title)}</strong><small>${w.classId?"Avec une classe":"Utilisation libre"} · Période ${w.period} · modifié le ${new Date(w.updatedAt).toLocaleDateString("fr-FR")}</small></span><em>›</em></button><button class="tool-work-more" data-work-more="${w.id}" aria-label="Actions">⋮</button></article>`).join(""):`<div class="tool-work-empty"><i>▤</i><strong>Aucun travail enregistré</strong><span>Après un enregistrement, votre travail apparaîtra ici.</span></div>`}</main></section>`;
    document.body.appendChild(overlay);requestAnimationFrame(()=>overlay.classList.add("open"));
    toolWorkClose.onclick=closeWorkLibrary;overlay.onclick=e=>{if(e.target===overlay)closeWorkLibrary()};
    overlay.querySelectorAll("[data-work-open-full]").forEach(b=>b.onclick=()=>{const w=rows.find(x=>x.id===b.dataset.workOpenFull);if(w){closeWorkLibrary();load(w)}});
    overlay.querySelectorAll("[data-work-more]").forEach(b=>b.onclick=()=>{const w=rows.find(x=>x.id===b.dataset.workMore);if(!w)return;const main=overlay.querySelector("main");main.innerHTML=`<div class="tool-work-actions-card"><i>▤</i><h3>${esc(w.title)}</h3><p>Choisissez l’action à effectuer sur ce travail.</p><button id="toolWorkEdit">✎ Ouvrir et modifier</button><button class="secondary" id="toolWorkCopy">▣ Dupliquer</button><button class="danger" id="toolWorkDelete">⌫ Supprimer</button><button class="secondary" id="toolWorkCancel">Annuler</button></div>`;toolWorkEdit.onclick=()=>{closeWorkLibrary();load(w)};toolWorkCopy.onclick=()=>{saveWork(type,w.title+" · copie",{...w.payload});closeWorkLibrary();openWorkLibrary(type,title,load)};toolWorkDelete.onclick=()=>{main.innerHTML=`<div class="tool-work-actions-card danger-card"><i>⌫</i><h3>Supprimer ce travail ?</h3><p>${esc(w.title)} sera supprimé de cet appareil.</p><button class="danger" id="toolWorkConfirmDelete">Supprimer définitivement</button><button class="secondary" id="toolWorkCancelDelete">Conserver</button></div>`;toolWorkConfirmDelete.onclick=()=>{writeWorks(readWorks().filter(x=>x.id!==w.id));closeWorkLibrary();openWorkLibrary(type,title,load)};toolWorkCancelDelete.onclick=()=>{closeWorkLibrary();openWorkLibrary(type,title,load)}};toolWorkCancel.onclick=()=>{closeWorkLibrary();openWorkLibrary(type,title,load)}})
  }
  function askWorkName(defaultValue,onSave){
    document.getElementById("toolSaveOverlay")?.remove();const overlay=document.createElement("div");overlay.id="toolSaveOverlay";overlay.className="tool-work-overlay";overlay.innerHTML=`<section class="tool-save-sheet"><header><i>💾</i><div><small>ENREGISTRER</small><h2>Nommer le travail</h2></div><button id="toolSaveClose">×</button></header><label>Nom du travail<input id="toolSaveName" value="${esc(defaultValue)}" maxlength="80"></label><div><button id="toolSaveConfirm">Enregistrer</button><button class="secondary" id="toolSaveCancel">Annuler</button></div></section>`;document.body.appendChild(overlay);requestAnimationFrame(()=>overlay.classList.add("open"));const close=()=>overlay.remove();toolSaveClose.onclick=toolSaveCancel.onclick=close;toolSaveConfirm.onclick=()=>{const name=toolSaveName.value.trim();if(!name){toolSaveName.focus();return}close();onSave(name)};toolSaveName.focus();toolSaveName.select();toolSaveName.onkeydown=e=>{if(e.key==="Enter")toolSaveConfirm.click()}
  }
  function download(name,text,type="text/plain"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
  async function renderMultiChronoWeb(){const ctx=await contextHtml();let timers=[{name:"Élève 1",ms:0,running:false,start:0}];toolPanel.innerHTML=header("Multi-chrono","Plusieurs chronos simultanés","⏱️")+`<main class="field-tool-card">${ctx}<div id="multiRows"></div><button id="multiAdd">＋ Ajouter un chrono</button></main>`;const drawRows=()=>multiRows.innerHTML=timers.map((t,i)=>`<div class="field-tool-counter"><input data-name="${i}" value="${esc(t.name)}"><b>${formatToolTime(t.ms+(t.running?Date.now()-t.start:0))}</b><button data-toggle="${i}">${t.running?"Pause":"Départ"}</button><button data-reset="${i}">↺</button></div>`).join("");drawRows();setInterval(()=>{if(document.getElementById("multiRows")&&timers.some(x=>x.running))drawRows()},100);multiAdd.onclick=()=>{timers.push({name:`Élève ${timers.length+1}`,ms:0,running:false,start:0});drawRows()};multiRows.onclick=e=>{let i=+e.target.dataset.toggle;if(Number.isInteger(i)){let t=timers[i];if(t.running){t.ms+=Date.now()-t.start;t.running=false}else{t.start=Date.now();t.running=true}drawRows()}i=+e.target.dataset.reset;if(Number.isInteger(i)){timers[i].ms=0;timers[i].running=false;drawRows()}};multiRows.onchange=e=>{if(e.target.dataset.name!==undefined)timers[+e.target.dataset.name].name=e.target.value};bindContext()}
  async function renderTournamentWeb(saved){const ctx=await contextHtml(),state=saved?.payload||{teams:"Équipe 1\nÉquipe 2\nÉquipe 3\nÉquipe 4",scores:{}};toolPanel.innerHTML=header("Tournois","Rencontres, scores et classement","🏆")+`<main class="field-tool-card">${ctx}<label>Équipes<textarea id="tourTeams" rows="5">${esc(state.teams)}</textarea></label><button id="tourBuild">Créer les rencontres</button><div id="tourMatches"></div></main><div class="tool-savebar"><button id="tourSave">💾 Enregistrer</button><button id="tourExport">▦ Exporter</button><button id="tourResume">↻ Reprendre</button></div><div id="tourSaved"></div>`;let id=saved?.id;const build=()=>{const names=tourTeams.value.split(/\n/).map(x=>x.trim()).filter(Boolean),matches=[];names.forEach((a,i)=>names.slice(i+1).forEach(b=>matches.push([a,b])));tourMatches.innerHTML=matches.map((m,i)=>`<div class="field-tool-counter"><span>${esc(m[0])} — ${esc(m[1])}</span><input type=number data-side="0" data-match="${i}" value="${state.scores[i]?.[0]||0}"><input type=number data-side="1" data-match="${i}" value="${state.scores[i]?.[1]||0}"></div>`).join("")};build();tourBuild.onclick=build;tourSave.onclick=()=>{document.querySelectorAll("#tourMatches input").forEach(x=>(state.scores[x.dataset.match]??=[0,0])[+x.dataset.side]=+x.value);const w=saveWork("tournament",prompt("Nom du tournoi",saved?.title||"Tournoi")||"Tournoi",{id,teams:tourTeams.value,scores:state.scores});id=w.id;renderTournamentWeb(w)};tourExport.onclick=()=>download("tournoi.txt",tourTeams.value+"\n\n"+tourMatches.innerText);tourResume.onclick=()=>{tourSaved.innerHTML=workList("tournament");bindWorks("tournament",()=>renderTournamentWeb(),renderTournamentWeb)};bindContext()}
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
    const state=compatible?saved.payload:{sport:"Basket-ball",bareme:20,indicators:OBS_PRESETS["Basket-ball"],values:{},activeId:null};
    let id=saved?.id;
    const eleves=()=>onRealClass()?toolStudents:[{id:FREE_USE,first_name:"Participant",last_name:"libre"}];
    const studentsHtml=()=>eleves().map(e=>`<div class="card unssPick" data-obs-student="${e.id}" style="margin-top:6px;cursor:pointer;${String(state.activeId)===String(e.id)?"border:2px solid #087dca":""}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>${esc(studentLabel(e))}</strong><span>${fr(obsNote(state,e.id))} / ${state.bareme}</span>
      </div></div>`).join("")||`<p class="muted">Choisissez une classe pour observer ses élèves, ou restez en usage libre pour un seul participant.</p>`;
    const indicatorsHtml=()=>{
      if(state.activeId==null)return `<p class="muted">Touchez un élève ci-dessus pour noter ses actions.</p>`;
      const v=state.values[state.activeId]||{};
      return state.indicators.map(([label,pol])=>`<div class="field-tool-counter">
        <b>${pol>0?"➕":"➖"} ${esc(label)}</b>
        <span style="display:flex;align-items:center;gap:8px">
          <button type="button" data-obs-dec="${esc(label)}" style="width:auto;margin:0;padding:4px 12px">−</button>
          <strong>${v[label]||0}</strong>
          <button type="button" data-obs-inc="${esc(label)}" style="width:auto;margin:0;padding:4px 12px">＋</button>
        </span>
      </div>`).join("");
    };
    toolPanel.innerHTML=header("Observateur","Compter les actions sans quitter le jeu, par élève","👁️")+
      `<main class="field-tool-card">${ctx}
        <div class="field-tool-row">
          <label>Sport<select id="obsSport">${Object.keys(OBS_PRESETS).map(s=>`<option value="${esc(s)}"${s===state.sport?" selected":""}>${esc(s)}</option>`).join("")}</select></label>
          <label>Barème<select id="obsBareme">${[5,10,20].map(b=>`<option value="${b}"${b===state.bareme?" selected":""}>/${b}</option>`).join("")}</select></label>
        </div>
        <h4 style="margin:10px 0 4px">Élèves</h4>
        <div id="obsStudents">${studentsHtml()}</div>
        <h4 style="margin:10px 0 4px">Indicateurs</h4>
        <div id="obsIndicators">${indicatorsHtml()}</div>
        <div class="field-tool-row"><input id="obsNew" placeholder="Nouvel indicateur"><select id="obsNewPol"><option value="1">Positif (+1)</option><option value="-1">Négatif (−1)</option></select><button id="obsAdd">Ajouter</button></div>
      </main>
      <div class="tool-savebar"><button id="obsSave">💾 Enregistrer</button><button id="obsExport">▦ Exporter</button><button id="obsResume">↻ Reprendre</button></div>
      <div id="obsSaved"></div>`;
    const redrawStudents=()=>{document.getElementById("obsStudents").innerHTML=studentsHtml();bindStudents()};
    const redrawIndicators=()=>{document.getElementById("obsIndicators").innerHTML=indicatorsHtml();bindIndicators()};
    function bindStudents(){
      document.querySelectorAll("[data-obs-student]").forEach(el=>el.onclick=()=>{state.activeId=el.dataset.obsStudent;redrawStudents();redrawIndicators()});
    }
    function bindIndicators(){
      document.querySelectorAll("[data-obs-inc]").forEach(el=>el.onclick=()=>{const l=el.dataset.obsInc;state.values[state.activeId]=state.values[state.activeId]||{};state.values[state.activeId][l]=(state.values[state.activeId][l]||0)+1;redrawIndicators();redrawStudents()});
      document.querySelectorAll("[data-obs-dec]").forEach(el=>el.onclick=()=>{const l=el.dataset.obsDec;const v=state.values[state.activeId]||{};v[l]=Math.max(0,(v[l]||0)-1);state.values[state.activeId]=v;redrawIndicators();redrawStudents()});
    }
    bindStudents();bindIndicators();
    document.getElementById("obsSport").onchange=e=>{state.sport=e.target.value;state.indicators=OBS_PRESETS[state.sport];state.values={};state.activeId=null;redrawStudents();redrawIndicators()};
    document.getElementById("obsBareme").onchange=e=>{state.bareme=+e.target.value;redrawStudents()};
    document.getElementById("obsAdd").onclick=()=>{
      const nom=document.getElementById("obsNew").value.trim();if(!nom)return;
      state.indicators=[...state.indicators,[nom,+document.getElementById("obsNewPol").value]];
      document.getElementById("obsNew").value="";redrawIndicators()
    };
    document.getElementById("obsSave").onclick=()=>{
      const w=saveWork("observer",prompt("Nom de l’observation",saved?.title||`Observation ${state.sport}`)||"Observation",{...state,id});
      id=w.id;renderObserverWeb(w)
    };
    document.getElementById("obsExport").onclick=()=>{
      const lignes=[["Élève",...state.indicators.map(([l])=>l),"Note"],
        ...eleves().map(e=>[studentLabel(e),...state.indicators.map(([l])=>String((state.values[e.id]||{})[l]||0)),`${fr(obsNote(state,e.id))}/${state.bareme}`])];
      download(`observation-${state.sport}.csv`,"\ufeff"+lignes.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(";")).join("\r\n"),"text/csv;charset=utf-8");
    };
    document.getElementById("obsResume").onclick=()=>{document.getElementById("obsSaved").innerHTML=workList("observer");bindWorks("observer",()=>renderObserverWeb(),renderObserverWeb)};
    bindContext(()=>{redrawStudents();redrawIndicators()});
  }
  async function renderRotationsWeb(saved){const ctx=await contextHtml(),state=saved?.payload||{stations:"Échauffement\nTechnique\nJeu réduit\nDéfi",groups:4,step:0};toolPanel.innerHTML=header("Rotations d’ateliers","Chaque groupe au bon atelier","🔄")+`<main class="field-tool-card">${ctx}<label>Ateliers<textarea id="rotStations" rows=5>${esc(state.stations)}</textarea></label><div class="field-tool-row"><label>Groupes<input id="rotGroups" type=number min=2 value="${state.groups}"></label><button id="rotNext">Rotation suivante</button></div><div id="rotRows"></div></main><div class="tool-savebar"><button id="rotSave">💾 Enregistrer</button><button id="rotExport">▦ Exporter</button><button id="rotResume">↻ Reprendre</button></div><div id="rotSaved"></div>`;let id=saved?.id;const drawRot=()=>{const a=rotStations.value.split(/\n/).filter(Boolean),n=Math.max(2,+rotGroups.value||2);rotRows.innerHTML=Array.from({length:n},(_,i)=>`<div class="field-tool-counter"><b>Groupe ${i+1}</b><span>${esc(a[(i+state.step)%a.length]||"Atelier")}</span></div>`).join("")};drawRot();rotNext.onclick=()=>{state.step++;drawRot()};rotStations.oninput=rotGroups.oninput=drawRot;rotSave.onclick=()=>{const w=saveWork("rotations",prompt("Nom",saved?.title||"Rotations d’ateliers")||"Rotations",{id,stations:rotStations.value,groups:+rotGroups.value,step:state.step});renderRotationsWeb(w)};rotExport.onclick=()=>download("rotations.txt",rotRows.innerText);rotResume.onclick=()=>{rotSaved.innerHTML=workList("rotations");bindWorks("rotations",()=>renderRotationsWeb(),renderRotationsWeb)};bindContext()}
  async function renderRandomWeb(){const ctx=await contextHtml();toolPanel.innerHTML=header("Tirage au sort","Un élève en un toucher","🎲")+`<main class="field-tool-card">${ctx}<div class="field-tool-card" id="randomResult" style="font-size:28px;text-align:center">Prêt</div><button id="randomGo">Tirer un élève</button></main>`;bindContext();document.getElementById("randomGo").onclick=async()=>{const mode=document.getElementById("modernMode"),cls=document.getElementById("modernClass"),result=document.getElementById("randomResult");if(mode.value==="class"&&!cls.value)return alert("Choisissez une classe.");await loadToolStudents(cls.value);result.textContent=toolStudents.length?studentLabel(toolStudents[Math.floor(Math.random()*toolStudents.length)]):`Participant ${1+Math.floor(Math.random()*99)}`}}
  async function renderEffortWeb(){const ctx=await contextHtml();toolPanel.innerHTML=header("Effort et intensité","Ressenti et zones cardiaques indicatives","❤️")+`<main class="field-tool-card">${ctx}<div class="field-tool-row"><label>Âge<input id="effAge" type=number min=5 max=100></label><label>Effort ressenti<input id="effRpe" type=range min=0 max=10 value=5></label></div><div class="field-tool-card" id="effResult">Complétez l’âge.</div></main>`;const calc=()=>{const age=+effAge.value,max=age?Math.round(208-.7*age):0;effResult.innerHTML=max?`<b>Effort ressenti : ${effRpe.value}/10</b><p>Zone modérée : ${Math.round(max*.6)}–${Math.round(max*.75)} bpm</p><p>Zone soutenue : ${Math.round(max*.75)}–${Math.round(max*.9)} bpm</p><small>Repères pédagogiques, sans valeur d’avis médical.</small>`:"Complétez l’âge."};effAge.oninput=effRpe.oninput=calc;bindContext()}
  async function renderAcrosportWeb(saved){const ctx=await contextHtml(),state=saved?.payload||{size:2,groups:[]};toolPanel.innerHTML=header("Groupes Acrosport","Binômes, trinômes puis groupes","🤸")+`<main class="field-tool-card">${ctx}<div class="field-tool-row"><button id="acro2">Binômes</button><button id="acro3">Trinômes</button><button id="acroBuild">Former les groupes</button></div><div id="acroStudents" class="tool-check-list"></div><div id="acroGroups" class="tool-groups"></div></main><div class="tool-savebar"><button id="acroSave">💾 Enregistrer</button><button id="acroExport">▦ Exporter</button><button id="acroResume">↻ Reprendre</button></div><div id="acroSaved"></div>`;let id=saved?.id;const load=async()=>{if(modernMode.value!=="class"||!modernClass.value){acroStudents.innerHTML="<p class=muted>Choisissez une classe.</p>";return}await loadToolStudents(modernClass.value);acroStudents.innerHTML=toolStudents.map(s=>`<label><input type=checkbox data-acro-student="${s.id}" checked> ${esc(studentLabel(s))}</label>`).join("")};const drawGroups=()=>acroGroups.innerHTML=state.groups.map((g,i)=>`<div class="tool-group"><h4>Groupe ${i+1}</h4>${g.map(id=>esc(studentLabel(toolStudents.find(s=>s.id===id)||{first_name:"Élève"}))).join("<br>")}</div>`).join("");acro2.onclick=()=>state.size=2;acro3.onclick=()=>state.size=3;acroBuild.onclick=()=>{const ids=[...document.querySelectorAll("[data-acro-student]:checked")].map(x=>x.dataset.acroStudent);state.groups=[];ids.forEach((x,i)=>(state.groups[Math.floor(i/state.size)]??=[]).push(x));drawGroups()};acroSave.onclick=()=>{if(!state.groups.length)return alert("Créez les groupes avant d’enregistrer.");const w=saveWork("acrosport",prompt("Nom",saved?.title||"Groupes Acrosport")||"Groupes Acrosport",{id,size:state.size,groups:state.groups});renderAcrosportWeb(w)};acroExport.onclick=()=>download("groupes-acrosport.txt",acroGroups.innerText);acroResume.onclick=()=>{acroSaved.innerHTML=workList("acrosport");bindWorks("acrosport",()=>renderAcrosportWeb(),renderAcrosportWeb)};bindContext(load);if(saved){setTimeout(async()=>{if(saved.classId){modernMode.value="class";modernClass.disabled=false;modernClass.value=saved.classId;await load();drawGroups()}},0)}}
  function injectSettings(){const body=document.getElementById("settingsBody");if(!body||document.getElementById("toolsLayoutSection"))return;const current=localStorage.getItem(prefKey)||"activities";body.insertAdjacentHTML("beforeend",`<details class="card settingsSection" id="toolsLayoutSection"><summary>Organisation des outils</summary><div class="settingsContents"><p>Choisissez la présentation utilisée dans l’onglet Outils.</p>${Object.entries(layouts).map(([k,v])=>`<label class="trash-row"><span><b>${esc(v)}</b></span><input type=radio name=toolsLayout value="${k}" ${k===current?"checked":""}></label>`).join("")}</div></details><details class="card settingsSection" id="webTrashSection"><summary>Corbeille</summary><div class="settingsContents"><button id="loadWebTrash">Afficher les éléments supprimés</button><div id="webTrashRows"></div></div></details>`);body.querySelectorAll("[name=toolsLayout]").forEach(r=>r.onchange=()=>{localStorage.setItem(prefKey,r.value);activity=null;draw()});document.getElementById("loadWebTrash").onclick=loadTrash}
  async function loadTrash(){const host=document.getElementById("webTrashRows"),tables=[["classes","Classe","name"],["students","Élève","last_name"],["evaluations","Évaluation","label"],["class_documents","Document","title"]];host.innerHTML="<p>Chargement…</p>";const all=[];for(const [table,kind,label] of tables){try{const rows=await lireTable(table,`${table}?deleted=eq.true&select=*&order=updated_at.desc`);rows.forEach(row=>all.push({table,kind,label:row[label]||kind,row}))}catch{}}host.innerHTML=all.length?all.map((x,i)=>`<div class="trash-row"><span><b>${esc(x.kind)}</b><br>${esc(x.label)}</span><button data-restore="${i}">Restaurer</button></div>`).join(""):"<p class=muted>La corbeille est vide.</p>";host.querySelectorAll("[data-restore]").forEach(b=>b.onclick=async()=>{const x=all[+b.dataset.restore];await enregistrerLigne(x.table,{...x.row,deleted:false,updated_at:new Date().toISOString()});loadTrash()})}
  const previousOpen=globalThis.openSettings;globalThis.openSettings=async function(){if(typeof previousOpen==="function")await previousOpen();injectSettings()};
  Object.assign(globalThis,{renderMultiChronoWeb,renderTournamentWeb,renderObserverWeb,renderRotationsWeb,renderRandomWeb,renderEffortWeb,renderAcrosportWeb,resetToolsWorkspace,
    isToolFavorite:id=>readFavorites().has(id),toggleToolFavorite:id=>{const active=toggleFavoriteId(id);draw();return active}});
  addEventListener("DOMContentLoaded",draw);
})();
