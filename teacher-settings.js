// Account-scoped settings. No credentials, PIN or signature are sent in the profile.
function teacherPrefsKey() { return `eps_teacher_preferences:${session?.user_id || "anonymous"}`; }
function readSettingsJson(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } }
function loadPrefs() {
  let prefs=readSettingsJson(teacherPrefsKey());
  if(!prefs) {
    // Claim the legacy browser profile once; never reuse it for a second account.
    const owner=localStorage.getItem("eps_legacy_preferences_owner");
    prefs=(!owner || owner===session?.user_id) ? (readSettingsJson("alexEpsPrefs") || {}) : {};
    if(session?.user_id) { localStorage.setItem("eps_legacy_preferences_owner",session.user_id); localStorage.setItem(teacherPrefsKey(),JSON.stringify(prefs)); }
  }
  const shared=cachedPeriodSettings();
  return shared ? {...prefs,periodCounts:shared.period_counts} : prefs;
}
function savePrefs(prefs) { localStorage.setItem(teacherPrefsKey(),JSON.stringify(prefs)); }
function profileCacheKey() { return `eps_teacher_profile:${session?.user_id || "anonymous"}`; }
let settingsPeriodRevision=0, settingsProfileRevision=0;
let openWeatherSettingsOnOpen=false;
function profilePayload(prefs) {
  return {teacherName:prefs.teacherName || "",proEmail:prefs.proEmail || "",schoolYear:prefs.schoolYear || "2026-2027",interactiveHomeEnabled:String(prefs.interactiveHomeEnabled===true || prefs.interactiveHomeEnabled==="true")};
}
async function refreshTeacherProfile() {
  const owner=session?.user_id;
  if(!owner) return;
  const res=await apiFetch(`${SUPABASE_URL}/rest/v1/teacher_profiles?user_id=eq.${owner}&select=*`);
  if(!res.ok) throw Error("Profil conservé sur cet appareil : appliquez schema_teacher_profile.sql dans Supabase.");
  const rows=await res.json();
  if(session?.user_id!==owner) return;
  localStorage.setItem(profileCacheKey(),JSON.stringify(rows[0] || {revision:0}));
  const prefs=loadPrefs();
  if(rows[0] && !prefs.profilePending) savePrefs({...prefs,...rows[0].profile});
}
async function refreshTeacherSettings() { await Promise.all([refreshPeriodSettings(),refreshTeacherProfile()]); }
async function sendTeacherProfile(prefs,revision) {
  const owner=session.user_id, profile=profilePayload(prefs);
  const res=await apiFetch(`${SUPABASE_URL}/rest/v1/rpc/save_teacher_profile`,{method:"POST",body:JSON.stringify({p_revision:revision,p_profile:profile})});
  if(!res.ok) throw Error("Envoi du profil refusé. Vérifiez schema_teacher_profile.sql.");
  const result=await res.json();
  if(!result.saved) throw Error("Le profil a changé sur un autre appareil. Votre saisie est conservée ; rouvrez les réglages pour comparer avant de réenregistrer.");
  if(session?.user_id!==owner) return;
  localStorage.setItem(profileCacheKey(),JSON.stringify({profile,revision:result.revision}));
  const current=loadPrefs();
  if(JSON.stringify(profilePayload(current))===JSON.stringify(profile)) savePrefs({...current,profilePending:false});
  settingsProfileRevision=result.revision;
}
function settingsEscape(value) { return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function settingsSection(id,title,body) { return `<details class="card settingsSection" id="${id}"><summary>${title}</summary><div class="settingsContents">${body}</div></details>`; }
function nestedSettingsSection(id,title,body) { return `<details class="settingsNested" id="${id}"><summary>${title}</summary><div class="settingsNestedContents">${body}</div></details>`; }
async function loadTeamContext() {
  if(!session?.user_id) return null;
  const res=await apiFetch(`${SUPABASE_URL}/rest/v1/rpc/eps_team_context`,{method:"POST",body:"{}"});
  return await res.json();
}
async function teamAdminAction(payload) {
  const res=await fetch(`${SUPABASE_URL}/functions/v1/eps-team-admin`,{method:"POST",headers:authHeaders(),body:JSON.stringify(payload)});
  let data={}; try { data=await res.json(); } catch {}
  if(res.status===401){sessionExpired();throw Error("Session expirée.");}
  if(!res.ok || !data.ok) throw Error(data.error || "Opération d’administration non confirmée.");
  return data;
}
async function openSettings() {
  const errors=[];
  let teamContext=null;
  await Promise.all([refreshPeriodSettings().catch(e=>errors.push(e.message)),refreshTeacherProfile().catch(e=>errors.push(e.message)),loadInstitution().catch(e=>errors.push("Établissement non actualisé.")),loadTeamContext().then(v=>teamContext=v).catch(()=>{})]);
  settingsPeriodRevision=cachedPeriodSettings()?.revision || 0;
  settingsProfileRevision=readSettingsJson(profileCacheKey())?.revision || 0;
  const prefs=loadPrefs(), esc=settingsEscape;
  const field=(id,label,value,type="text",readonly=false)=>`<div><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value)}" ${readonly?"readonly":""}></div>`;
  const grades=["SIXIEME","CINQUIEME","QUATRIEME","TROISIEME","SECONDE","SECONDE_SPORT_SANTE","PREMIERE","PREMIERE_EPPCS","TERMINALE","TERMINALE_EPPCS","OPTION_GOLF"].filter(g=>GRADE_LABELS[g]);
  const colleagues=(teamContext?.members || []).filter(member=>member.id!==session.user_id);
  const administration=teamContext?.is_admin ? nestedSettingsSection("teacherAdminSection","Administration des professeurs",`<p class="muted">Vous êtes administrateur de l’établissement. Les collègues définissent eux-mêmes leur mot de passe.</p><form id="inviteTeacherForm"><div class="row">${field("inviteTeacherName","Nom du professeur","")}${field("inviteTeacherEmail","E-mail professionnel","","email")}</div><button type="submit">Inviter un professeur</button></form><div class="teacherAdminList">${colleagues.length?colleagues.map(member=>`<div class="teacherAdminRow" data-teacher-id="${esc(member.id)}"><div><strong>${esc(member.name || member.email)}</strong><br><span class="muted">${esc(member.email || "")}</span></div><div><button type="button" class="secondary resetTeacherPasswordBtn">Renvoyer l’invitation / mot de passe</button><button type="button" class="danger deleteTeacherBtn">Supprimer</button></div></div>`).join(""):'<p>Aucun autre professeur rattaché.</p>'}</div>`) : "";
  document.getElementById("settingsBody").innerHTML=
    settingsSection("profileSection","Profil enseignant",`<div class="row">${field("prefName","Nom de l’enseignant",prefs.teacherName)}${field("prefSchool","Établissement",currentInstitution?.name || prefs.schoolName, "text",!!currentInstitution)}</div><div class="row">${field("prefEmail","E-mail professionnel",prefs.proEmail,"email")}${field("prefYear","Année scolaire",prefs.schoolYear || "2026-2027")}</div><button id="saveProfileBtn">Enregistrer le profil</button>`)+
    settingsSection("accountSection","Compte web / synchronisation",`<p>Connecté : ${esc(session.email)}</p><p>${currentInstitution?`Rattaché à ${esc(currentInstitution.name)} (code ${esc(currentInstitution.code)}).`:"Aucun établissement rattaché."}</p><button id="syncSettingsBtn">Actualiser les réglages</button><button class="secondary" id="settingsInstitutionBtn">${currentInstitution?"Gérer mon établissement":"Se rattacher à un établissement"}</button><button class="secondary" id="settingsLogoutBtn">Déconnecter</button>${administration}${nestedSettingsSection("backupSection","Sauvegarde / restauration",`<p>Exporter les données accessibles à ce compte au format JSON.</p><button id="exportDataBtn">Exporter mes données web</button><p class="muted">La restauration des sauvegardes Android se fait dans l’application, puis par synchronisation. Un export web n’est pas une sauvegarde Android.</p>`)}${nestedSettingsSection("resetSection","Réinitialisation",`<p>Actions irréversibles : exporte une sauvegarde avant de continuer.</p><button class="danger" id="resetPersonalBtn">Réinitialiser mes données</button><button class="danger" id="resetSchoolBtn" ${currentInstitution?"":"disabled"}>Réinitialisation complète établissement</button>`)}${nestedSettingsSection("privacySection","Confidentialité et sécurité",`<p>Les réglages partagés sont privés à ton compte. Le PIN reste sur cet appareil et ne remplace pas la sécurité du compte. La biométrie Android n’est pas disponible ici.</p>${field("settingsPin","Code PIN local (4 à 8 chiffres)","","password")}<button id="setPinBtn">${prefs.pin?"Changer":"Activer"} le code</button>${prefs.pin?'<button class="secondary" id="removePinBtn">Désactiver le code</button>':""}`)}`)+
    settingsSection("periodSection","Réglage des périodes",`<p>Choisis 3, 4 ou 5 périodes pour chaque niveau, comme dans l’application.</p>${grades.map(grade=>`<div class="settingsPeriodRow"><span>${esc(GRADE_LABELS[grade])}</span><div role="group" aria-label="Périodes ${esc(GRADE_LABELS[grade])}">${[3,4,5].map(n=>`<button type="button" class="periodChoice ${n===periodCountForLevel(grade,prefs)?"selected":""}" data-grade="${grade}" data-count="${n}" aria-pressed="${n===periodCountForLevel(grade,prefs)}">${n}</button>`).join("")}</div></div>`).join("")}<button id="savePeriodsBtn">Enregistrer les périodes</button>`)+
    settingsSection("visualSection","Visuel de l’accueil",`<div class="row"><button id="basicVisualBtn" class="${profilePayload(prefs).interactiveHomeEnabled==="false"?"":"secondary"}">Visuel basique</button><button id="interactiveVisualBtn" class="${profilePayload(prefs).interactiveHomeEnabled==="true"?"":"secondary"}">Visuel interactif</button></div>`)+
    settingsSection("weatherSettingsSection","Météo de l’accueil",`<p>Ville actuelle : <strong>${settingsEscape(weatherCity()?.name || "Non réglée")}</strong></p><form id="settingsWeatherForm"><label for="settingsWeatherCity">Ville<input id="settingsWeatherCity" placeholder="Ex. Marrakech" minlength="2" maxlength="100" required autocomplete="off"></label><button type="submit">Rechercher</button></form><div id="settingsWeatherResults" class="weatherSearchResults" aria-live="polite"></div><p class="muted">La ville recherchée est transmise à Open-Meteo. Aucune localisation GPS ni donnée scolaire n’est utilisée.</p>`)+
    `<p id="settingsOk" role="status" aria-live="polite"></p>`;
  document.getElementById("settingsOk").textContent=errors.join(" ") || (prefs.profilePending?"Un profil enregistré localement attend sa synchronisation.":"");
  document.getElementById("settingsOverlay").classList.add("open");
  if(openWeatherSettingsOnOpen){document.getElementById("weatherSettingsSection").open=true;openWeatherSettingsOnOpen=false;}
  const bind=(id,fn)=>{const el=document.getElementById(id); if(el) el.onclick=async()=>{el.disabled=true;try{await fn();}catch(e){document.getElementById("settingsOk").textContent=e.message;}finally{el.disabled=false;}};};
  bind("saveProfileBtn",saveSettings);
  bind("savePeriodsBtn",async()=>{
    const counts=Object.fromEntries([...document.querySelectorAll(".periodChoice.selected")].map(b=>[b.dataset.grade,Number(b.dataset.count)]));
    await savePeriodSettings(counts,settingsPeriodRevision);
    settingsPeriodRevision=cachedPeriodSettings().revision;
    document.getElementById("periodSection").open=false;
    document.getElementById("settingsOk").textContent="Périodes enregistrées et synchronisées.";
  });
  document.querySelectorAll(".periodChoice").forEach(b=>b.onclick=()=>{b.parentElement.querySelectorAll("button").forEach(other=>{other.classList.toggle("selected",other===b);other.setAttribute("aria-pressed",String(other===b));});});
  bind("syncSettingsBtn",openSettings);
  const inviteForm=document.getElementById("inviteTeacherForm");
  if(inviteForm) inviteForm.onsubmit=async event=>{event.preventDefault();const button=inviteForm.querySelector("button");button.disabled=true;try{const result=await teamAdminAction({action:"invite",name:document.getElementById("inviteTeacherName").value,email:document.getElementById("inviteTeacherEmail").value});document.getElementById("settingsOk").textContent=result.message;inviteForm.reset();}catch(e){document.getElementById("settingsOk").textContent=e.message;}finally{button.disabled=false;}};
  document.querySelectorAll(".resetTeacherPasswordBtn").forEach(button=>button.onclick=async()=>{button.disabled=true;try{const result=await teamAdminAction({action:"reset_password",target_id:button.closest(".teacherAdminRow").dataset.teacherId});document.getElementById("settingsOk").textContent=result.message;}catch(e){document.getElementById("settingsOk").textContent=e.message;}finally{button.disabled=false;}});
  document.querySelectorAll(".deleteTeacherBtn").forEach(button=>button.onclick=async()=>{const row=button.closest(".teacherAdminRow"),name=row.querySelector("strong").textContent;if(!confirm(`Supprimer définitivement le compte de ${name} et toutes ses données personnelles ? Les groupes et appels AS seront conservés.`))return;button.disabled=true;try{const result=await teamAdminAction({action:"delete",target_id:row.dataset.teacherId,confirm:true});row.remove();document.getElementById("settingsOk").textContent=result.message;}catch(e){document.getElementById("settingsOk").textContent=e.message;}finally{button.disabled=false;}});
  bind("settingsLogoutBtn",()=>document.getElementById("logoutBtn").click());
  bind("settingsInstitutionBtn",()=>{document.getElementById("settingsOverlay").classList.remove("open");showTab("home");if(currentInstitution){document.getElementById("institutionCard").scrollIntoView({block:"center"});}else openInstitutionChooser();});
  bind("exportDataBtn",exportAllData);
  for(const [id,value] of [["basicVisualBtn",false],["interactiveVisualBtn",true]]) bind(id,async()=>{
    const next={...loadPrefs(),interactiveHomeEnabled:value,profilePending:true};savePrefs(next);applyHomeVisual();
    await sendTeacherProfile(next,settingsProfileRevision);await openSettings();
  });
  bind("setPinBtn",()=>{const pin=document.getElementById("settingsPin").value;if(!/^\d{4,8}$/.test(pin))throw Error("Saisis entre 4 et 8 chiffres.");savePrefs({...loadPrefs(),pin});return openSettings();});
  bind("removePinBtn",()=>{const next=loadPrefs();delete next.pin;savePrefs(next);return openSettings();});
  bind("resetPersonalBtn",()=>resetSettingsData(false));bind("resetSchoolBtn",()=>resetSettingsData(true));
  document.getElementById("settingsWeatherForm").onsubmit=async event=>{
    event.preventDefault();const button=event.currentTarget.querySelector("button"),results=document.getElementById("settingsWeatherResults"),query=document.getElementById("settingsWeatherCity").value.trim();
    if(query.length<2)return;button.disabled=true;results.textContent="Recherche…";
    try { const cities=await searchWeatherCities(query);results.replaceChildren();if(!cities.length)results.textContent="Aucune ville trouvée.";
      cities.forEach(city=>{const choice=document.createElement("button");choice.type="button";choice.className="secondary";choice.textContent=[city.name,city.admin1,city.country].filter(Boolean).join(" · ");choice.onclick=()=>{saveWeatherCity(city,choice.textContent);document.getElementById("settingsOk").textContent="Ville météo enregistrée.";openSettings();};results.appendChild(choice);});
    } catch {results.textContent="Recherche indisponible. Vérifie ta connexion.";} finally {button.disabled=false;}
  };
}
async function saveSettings() {
  const input=document.getElementById("prefEmail"); if(!input.reportValidity()) return;
  const prefs={...loadPrefs(),teacherName:document.getElementById("prefName").value.trim(),schoolName:currentInstitution?.name || document.getElementById("prefSchool").value.trim(),proEmail:input.value.trim(),schoolYear:document.getElementById("prefYear").value.trim(),profilePending:true};
  savePrefs(prefs); // Independent of periods/network failures.
  try { await sendTeacherProfile(prefs,settingsProfileRevision); }
  catch(e) { throw Error(`Profil enregistré dans ce navigateur. ${e.message}`); }
  document.getElementById("profileSection").open=false;
  document.getElementById("settingsOk").textContent="Profil enregistré et synchronisé.";
  applyHomeVisual();
}
async function resetSettingsData(shared) {
  if(shared && !currentInstitution) throw Error("Un établissement rattaché est nécessaire.");
  if(!confirm(shared?`Supprimer les données partagées de ${currentInstitution.name} pour tous les professeurs ? Action irréversible.`:"Supprimer mes classes, élèves, plannings, cours et évaluations ? Les données des collègues ne seront pas touchées. Action irréversible."))return;
  const rpc=shared?"reset_institution_eps_data":"reset_my_eps_data";
  const res=await apiFetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`,{method:"POST",body:JSON.stringify(shared?{p_confirmation_code:currentInstitution.code}:{})});
  if(!res.ok) throw Error("Réinitialisation non confirmée. Aucune remise à zéro locale effectuée.");
  location.reload();
}
function applyHomeVisual() {
  const interactive=profilePayload(loadPrefs()).interactiveHomeEnabled==="true";
  const grid=document.querySelector(".homeGrid");if(!grid)return;
  for(const [tab,label,icon] of [["planning","Planning","📅"],["cours","Cours","📚"]]) {
    let card=grid.querySelector(`[data-goto="${tab}"]`);
    if(!card){card=document.createElement("button");card.className="homeCard";card.dataset.goto=tab;card.innerHTML=`<span class="homeIcon">${icon}</span><span class="homeTitle">${label}</span>`;card.onclick=()=>showTab(tab);grid.appendChild(card);}
    card.hidden=interactive;
  }
  grid.classList.toggle("interactive",interactive);
  const greeting=document.getElementById("homeGreeting");if(greeting)greeting.textContent=loadPrefs().teacherName?`Bonjour ${loadPrefs().teacherName}`:"Bonjour";
}
