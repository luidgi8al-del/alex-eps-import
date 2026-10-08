// Module isole : le code vit dans une fonction, pas dans la portee globale.
// Deux fichiers peuvent donc declarer le meme nom sans SyntaxError qui tue la page.
// Les noms ci-dessous restent volontairement globaux : l'inline script d'index.html
// et les attributs onclick du HTML les appellent par leur nom nu.
(function () {
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
  globalThis.openWeatherSettingsOnOpen=false;
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
  /**
   * Contexte d'equipe du compte connecte, retenu le temps de la session.
   *
   * C'est une interrogation couteuse - une fonction SQL qui parcourt les profils et
   * l'etablissement - et elle ne change pas d'une minute a l'autre. Elle etait pourtant relancee
   * a chaque affichage de la liste des classes, donc a chaque rafraichissement d'ecran pendant
   * une synchronisation : des dizaines d'appels pour une reponse identique, sur une instance qui
   * n'en demandait pas tant.
   *
   * Le cache est indexe par compte : basculer sur un collegue redemande le sien.
   */
  let contexteEquipe = null;
  let contexteEquipeCompte = null;
  let contexteEquipeEnCours = null;

  async function loadTeamContext() {
    if(!session?.user_id) return null;
    const owner = session.user_id;
    const cacheKey = `eps:offline-team:${owner}`;
    if (navigator.onLine === false) {
      const cached = readSettingsJson(cacheKey);
      if (cached) return cached;
      throw Error("Préparez cet appareil avec une connexion pour retrouver votre équipe hors connexion.");
    }
    if(contexteEquipe && contexteEquipeCompte === session.user_id) return contexteEquipe;
    if(contexteEquipeEnCours && contexteEquipeCompte === session.user_id) return contexteEquipeEnCours;
    contexteEquipeCompte = session.user_id;
    contexteEquipeEnCours = lireContexteEquipe()
      .then(v => {
        if (session?.user_id === owner) {
          contexteEquipe = v;
          localStorage.setItem(cacheKey, JSON.stringify(v));
        }
        return v;
      })
      .finally(() => { contexteEquipeEnCours = null; });
    return contexteEquipeEnCours;
  }

  /** Force la relecture : apres une invitation ou un changement de droits. */
  function oublierContexteEquipe() { contexteEquipe = null; contexteEquipeCompte = null; }

  async function lireContexteEquipe() {
    if(!session?.user_id) return null;
    try {
      const res=await apiFetch(`${SUPABASE_URL}/rest/v1/rpc/eps_team_context`,{method:"POST",body:"{}"});
      const context=await res.json();
      if(context && typeof context.is_admin==="boolean") return context;
    } catch {}
    // Repli RLS : seules les lignes du même établissement sont visibles au compte connecté.
    const profileRes=await apiFetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(session.user_id)}&select=institution_id`);
    const profiles=profileRes.ok ? await profileRes.json() : [];
    const institutionId=profiles[0]?.institution_id;
    if(!institutionId) return {active:true,institution_id:null,is_admin:false,members:[]};
    const [institutionRes,membersRes]=await Promise.all([
      apiFetch(`${SUPABASE_URL}/rest/v1/institutions?id=eq.${encodeURIComponent(institutionId)}&select=created_by`),
      apiFetch(`${SUPABASE_URL}/rest/v1/profiles?institution_id=eq.${encodeURIComponent(institutionId)}&select=id,email`)
    ]);
    const institutions=institutionRes.ok ? await institutionRes.json() : [];
    const members=membersRes.ok ? await membersRes.json() : [];
    return {active:true,institution_id:institutionId,is_admin:institutions[0]?.created_by===session.user_id,members:members.map(member=>({id:member.id,email:member.email,name:member.email}))};
  }
  async function teamAdminAction(payload) {
    // La bascule de compte et les invitations passent par une fonction serveur : elles ne
    // peuvent pas aboutir hors connexion. Autant le dire, plutot que "Failed to fetch".
    // Un seul renouvellement, comme dans apiFetch : le jeton expire ne doit pas coûter une
    // reconnexion au milieu d'une action d'administration.
    const appeler=()=>fetch(`${SUPABASE_URL}/functions/v1/eps-team-admin`,
      {method:"POST",headers:authHeaders(),body:JSON.stringify(payload)});
    let res;
    try {
      res=await appeler();
      if(res.status===401 && await renouvelerSession()) res=await appeler();
    } catch { throw Error("Pas de réseau. Cette action d'administration a besoin d'une connexion."); }
    let data={}; try { data=await res.json(); } catch {}
    if(res.status===401){sessionExpired();throw Error("Session expirée.");}
    if(!res.ok || !data.ok) throw Error(data.error || "Opération d’administration non confirmée.");
    // Creer, inviter ou supprimer un collegue change la composition de l'equipe : le contexte
    // retenu n'est plus a jour et doit etre relu au prochain affichage.
    if(payload && payload.action !== "pending_invites") oublierContexteEquipe();
    return data;
  }
  async function openSettings() {
    const errors=[];
    let teamContext=null,pendingInvites=[],managerContext=null;
    // Chaque appel nomme sa source. Sans cela, cinq appels differents produisaient le meme
    // "Failed to fetch" en bas du panneau, et rien ne disait lequel avait echoue.
    await Promise.all([
      refreshPeriodSettings().catch(e=>errors.push("Périodes : "+e.message)),
      refreshTeacherProfile().catch(e=>errors.push("Profil : "+e.message)),
      loadInstitution().catch(()=>errors.push("Établissement non actualisé.")),
      loadTeamContext().then(v=>teamContext=v).catch(e=>errors.push("Équipe : "+e.message)),
      teamAdminAction({action:"pending_invites"}).then(r=>pendingInvites=r.invites||[]).catch(e=>errors.push("Invitations : "+e.message))]);
    if(teamContext?.is_admin){
      try{
        const response=await apiFetch(`${SUPABASE_URL}/rest/v1/rpc/eps_installation_manager_admin_context`,{method:"POST",body:"{}"});
        managerContext=await response.json();
      }catch(e){errors.push("Responsable des installations : configuration Supabase à terminer.");}
    }
    settingsPeriodRevision=cachedPeriodSettings()?.revision || 0;
    settingsProfileRevision=readSettingsJson(profileCacheKey())?.revision || 0;
    const prefs=loadPrefs(), esc=settingsEscape;
    const gmailState=typeof gmailDraftState==="function" ? gmailDraftState() : {connected:false,email:""};
    const field=(id,label,value,type="text",readonly=false)=>`<div><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value)}" ${readonly?"readonly":""}></div>`;
    const grades=["SIXIEME","CINQUIEME","QUATRIEME","TROISIEME","SECONDE","SECONDE_SPORT_SANTE","PREMIERE","PREMIERE_EPPCS","TERMINALE","TERMINALE_EPPCS","OPTION_GOLF"].filter(g=>GRADE_LABELS[g]);
    const colleagues=(teamContext?.members || []).filter(member=>member.id!==session.user_id);
    const teacherAdministration=`<p class="muted">Vous êtes administrateur de l’établissement. Les collègues définissent eux-mêmes leur mot de passe.</p><form id="inviteTeacherForm"><div class="row">${field("inviteTeacherName","Nom du professeur","")}${field("inviteTeacherEmail","E-mail professionnel","","email")}</div><button type="submit">Créer le compte</button><button type="button" class="secondary" id="inviteAndSendBtn">Créer et inviter tout de suite</button><p class="muted">Créer le compte réserve sa place sans lui écrire. Préparez ses classes en les lui attribuant, puis envoyez l’invitation quand c’est prêt.</p></form>${pendingInvites.length?`<h3 style="font-size:14px; margin:12px 0 4px">Comptes créés, invitation pas encore envoyée</h3><div class="teacherAdminList">${pendingInvites.map(inv=>`<div class="teacherAdminRow" data-pending-email="${esc(inv.email)}"><div><strong>${esc(inv.name||inv.email)}</strong><br><span class="muted">${esc(inv.email)}</span></div><div><button type="button" class="sendPendingInviteBtn">Envoyer l’invitation</button><button type="button" class="danger cancelPendingInviteBtn">Annuler la réservation</button></div></div>`).join("")}</div>`:""}<div class="teacherAdminList">${colleagues.length?colleagues.map(member=>`<div class="teacherAdminRow" data-teacher-id="${esc(member.id)}"><div><strong>${esc(member.name || member.email)}</strong><br><span class="muted">${esc(member.email || "")}</span></div><div><button type="button" class="switchTeacherBtn">Basculer sur ce compte</button><button type="button" class="secondary resetTeacherPasswordBtn">Renvoyer l’invitation / mot de passe</button><button type="button" class="danger deleteTeacherBtn">Supprimer</button></div></div>`).join(""):'<p>Aucun autre professeur rattaché.</p>'}</div>`;
    const currentManager=managerContext?.manager;
    const managerAdministration=`<p class="muted">Ce compte ouvre uniquement le suivi des installations. Il ne voit ni les classes, ni les élèves, ni les autres données des professeurs.</p>${currentManager?`<div class="teacherAdminRow managerAccountRow"><div><strong>Responsable actuel</strong><br><span class="muted">${esc(currentManager.email||"")}</span></div><div><button type="button" class="secondary" id="resetManagerPasswordBtn">Renvoyer l’invitation / mot de passe</button><a class="buttonLink" href="responsable-installations.html" target="_blank" rel="noopener">Ouvrir son espace</a></div></div><p class="muted">Pour remplacer le responsable, invitez la nouvelle adresse ci-dessous. L’ancien accès sera automatiquement retiré.</p>`:"<p>Aucun responsable des installations n’est encore autorisé.</p>"}<form id="inviteManagerForm"><div class="row">${field("inviteManagerEmail","E-mail du responsable","","email")}</div><button type="submit">Créer et inviter le responsable</button><p class="muted">Le responsable recevra un lien sécurisé pour choisir son mot de passe. L’inscription publique peut rester désactivée dans Supabase.</p></form>`;
    const administration=teamContext?.is_admin ? nestedSettingsSection("teacherAdminSection","Administration des comptes",`<div class="accountAdminTabs" role="tablist" aria-label="Type de compte"><button type="button" class="active" id="teacherAccountsTab" role="tab" aria-selected="true">Créer / inviter un professeur</button><button type="button" class="secondary" id="managerAccountTab" role="tab" aria-selected="false">Créer / inviter le responsable</button></div><div id="teacherAccountsPanel" role="tabpanel">${teacherAdministration}</div><div id="managerAccountPanel" role="tabpanel" hidden>${managerAdministration}</div>`) : "";
    document.getElementById("settingsBody").innerHTML=
      settingsSection("offlineSection","Utiliser sans connexion",`<p>La préparation se fait automatiquement avec Internet, puis reprend si la connexion a été interrompue. Le voyant vert signifie que cet appareil est prêt.</p><button id="prepareOfflineBtn" class="secondary">Vérifier / relancer</button><p id="offlinePreparationStatus" class="error" role="status" aria-live="polite" hidden></p><p class="muted">Classes, élèves, planning, évaluations et données AS synchronisées sont conservés sur cet appareil, même après une déconnexion du compte. Pour continuer à travailler sans Internet, ferme simplement l’application sans te déconnecter : après une vraie déconnexion, Internet sera nécessaire pour vérifier ton mot de passe et rouvrir la copie. Les e-mails, l’administration et les ressources externes nécessitent Internet.</p>`)+
      settingsSection("profileSection","Profil enseignant",`<div class="row">${field("prefName","Nom de l’enseignant",prefs.teacherName)}${field("prefSchool","Établissement",currentInstitution?.name || prefs.schoolName, "text",!!currentInstitution)}</div><div class="row">${field("prefEmail","E-mail professionnel",prefs.proEmail,"email")}${field("prefYear","Année scolaire",prefs.schoolYear || "2026-2027")}</div><button id="saveProfileBtn">Enregistrer le profil</button>`)+
      settingsSection("gmailSection","Gmail professionnel",`<p>${gmailState.connected?`<strong>Connecté pour cette session :</strong> ${esc(gmailState.email)}`:gmailState.email?`Dernier compte utilisé : ${esc(gmailState.email)}. Reconnectez-le pour créer des brouillons.`:"Connectez votre compte Gmail professionnel pour y préparer des brouillons personnalisés."}</p><button id="gmailConnectBtn">${gmailState.connected?"Changer de compte Gmail":"Connecter mon Gmail professionnel"}</button>${gmailState.connected?'<button class="secondary" id="gmailDisconnectBtn">Déconnecter Gmail du site</button>':""}<p class="muted">Le site demande uniquement le droit de gérer des brouillons et d’envoyer des messages. Le jeton Google reste en mémoire jusqu’à la fermeture ou au rechargement de cette page. Le site ne lit pas votre boîte de réception.</p>`)+
      settingsSection("accountSection","Compte web / synchronisation",`<p>Connecté : ${esc(session.email)}</p><p>${currentInstitution?`Rattaché à ${esc(currentInstitution.name)} (code ${esc(currentInstitution.code)}).`:(rattachementIncertain?"Rattachement à l’établissement non vérifiable pour l’instant.":"Aucun établissement rattaché.")}</p><button id="syncSettingsBtn">Actualiser les réglages</button><button class="secondary" id="settingsInstitutionBtn">${currentInstitution?"Gérer mon établissement":"Se rattacher à un établissement"}</button><button class="secondary" id="settingsLogoutBtn">Déconnecter en conservant la copie locale</button>${administration}${nestedSettingsSection("backupSection","Sauvegarde / restauration",`<p>Exporter les données accessibles à ce compte au format JSON.</p><button id="exportDataBtn">Exporter mes données web</button><p class="muted">La restauration des sauvegardes Android se fait dans l’application, puis par synchronisation. Un export web n’est pas une sauvegarde Android.</p>`)}${nestedSettingsSection("resetSection","Réinitialisation",`<p>Actions irréversibles : exporte une sauvegarde avant de continuer.</p><button class="danger" id="resetPersonalBtn">Réinitialiser mes données</button><button class="danger" id="resetSchoolBtn" ${currentInstitution?"":"disabled"}>Réinitialisation complète établissement</button>`)}${nestedSettingsSection("privacySection","Confidentialité et sécurité",`<p>Les réglages partagés sont privés à ton compte. La copie hors connexion reste sur cet appareil après la déconnexion. Sur un ordinateur perdu, prêté ou partagé, utilise la commande ci-dessous. Le PIN reste sur cet appareil et ne remplace pas la sécurité du compte.</p>${field("settingsPin","Code PIN local (4 à 8 chiffres)","","password")}<button id="setPinBtn">${prefs.pin?"Changer":"Activer"} le code</button>${prefs.pin?'<button class="secondary" id="removePinBtn">Désactiver le code</button>':""}<button class="danger" id="logoutAndEraseBtn">Déconnecter et effacer les copies de cet appareil</button>`)}`)+
      settingsSection("periodSection","Réglage des périodes",`<p>Choisis 3, 4 ou 5 périodes pour chaque niveau, comme dans l’application.</p>${grades.map(grade=>`<div class="settingsPeriodRow"><span>${esc(GRADE_LABELS[grade])}</span><div role="group" aria-label="Périodes ${esc(GRADE_LABELS[grade])}">${[3,4,5].map(n=>`<button type="button" class="periodChoice ${n===periodCountForLevel(grade,prefs)?"selected":""}" data-grade="${grade}" data-count="${n}" aria-pressed="${n===periodCountForLevel(grade,prefs)}">${n}</button>`).join("")}</div></div>`).join("")}<button id="savePeriodsBtn">Enregistrer les périodes</button>`)+
      settingsSection("visualSection","Visuel de l’accueil",`<div class="row"><button id="basicVisualBtn" class="${profilePayload(prefs).interactiveHomeEnabled==="false"?"":"secondary"}">Visuel basique</button><button id="interactiveVisualBtn" class="${profilePayload(prefs).interactiveHomeEnabled==="true"?"":"secondary"}">Visuel interactif</button></div>
        <p class="muted" style="margin:14px 0 6px">Couleurs des professeurs dans le Planning global EPS. Ce choix ne vaut que sur cet appareil.</p>
        <div class="row"><button id="palettePaleBtn" class="${prefs.planningPaletteVive?"secondary":""}">Couleurs claires</button><button id="paletteViveBtn" class="${prefs.planningPaletteVive?"":"secondary"}">Couleurs vives</button></div>`)+
      settingsSection("weatherSettingsSection","Météo de l’accueil",`<button type="button" id="toggleHomeWeatherBtn" aria-pressed="${weatherEnabled()}">${weatherEnabled()?"Masquer la météo":"Afficher la météo"}</button><p>Ville actuelle : <strong>${settingsEscape(weatherCity()?.name || "Non réglée")}</strong></p><form id="settingsWeatherForm"><label for="settingsWeatherCity">Ville<input id="settingsWeatherCity" placeholder="Ex. Marrakech" minlength="2" maxlength="100" required autocomplete="off"></label><button type="submit">Rechercher</button></form><div id="settingsWeatherResults" class="weatherSearchResults" aria-live="polite"></div><p class="muted">La ville recherchée est transmise à Open-Meteo. Aucune localisation GPS ni donnée scolaire n’est utilisée.</p>`)+
      `<p id="settingsOk" role="status" aria-live="polite"></p>`;
    document.getElementById("settingsOk").textContent=errors.join(" ") || (prefs.profilePending?"Un profil enregistré localement attend sa synchronisation.":"");
    document.getElementById("settingsOverlay").classList.add("open");
    if(globalThis.openWeatherSettingsOnOpen){document.getElementById("weatherSettingsSection").open=true;globalThis.openWeatherSettingsOnOpen=false;}
    const bind=(id,fn)=>{const el=document.getElementById(id); if(el) el.onclick=async()=>{el.disabled=true;try{await fn();}catch(e){document.getElementById("settingsOk").textContent=e.message;}finally{el.disabled=false;}};};
    bind("saveProfileBtn",saveSettings);
    bind("gmailConnectBtn",async()=>{const state=await connectGmailProfessional();document.getElementById("settingsOk").textContent=`Gmail connecté : ${state.email}.`;await openSettings();document.getElementById("gmailSection").open=true;});
    bind("gmailDisconnectBtn",async()=>{disconnectGmailProfessional();await openSettings();document.getElementById("gmailSection").open=true;});
    bind("savePeriodsBtn",async()=>{
      const counts=Object.fromEntries([...document.querySelectorAll(".periodChoice.selected")].map(b=>[b.dataset.grade,Number(b.dataset.count)]));
      await savePeriodSettings(counts,settingsPeriodRevision);
      settingsPeriodRevision=cachedPeriodSettings().revision;
      document.getElementById("periodSection").open=false;
      document.getElementById("settingsOk").textContent="Périodes enregistrées et synchronisées.";
    });
    document.querySelectorAll(".periodChoice").forEach(b=>b.onclick=()=>{b.parentElement.querySelectorAll("button").forEach(other=>{other.classList.toggle("selected",other===b);other.setAttribute("aria-pressed",String(other===b));});});
    bind("syncSettingsBtn",openSettings);
    const syncPanel = document.createElement('div');
    syncPanel.className='settingsConnectionDetails';
    syncPanel.innerHTML='<p id="settingsSyncDetails" class="muted"></p><p id="settingsSyncError" class="error" hidden></p><button type="button" class="secondary" id="settingsSyncRetry">Réessayer la synchronisation</button><button type="button" class="secondary" id="settingsSyncConflicts" hidden>Voir les conflits</button>';
    document.querySelector('#accountSection > .settingsContents').prepend(syncPanel);
    const recoveryButton = document.createElement("button");
    recoveryButton.className = "secondary";
    recoveryButton.textContent = "Conflits et versions conservées";
    recoveryButton.onclick = () => ouvrirFenetreConflits();
    document.querySelector('#accountSection > .settingsContents').appendChild(recoveryButton);
    bind("settingsSyncRetry",async()=>{await (await demarrerModeHorsConnexion())?.synchroniser();});
    bind("settingsSyncConflicts",ouvrirFenetreConflits);
    renderConnectionSettings();
    startAutomaticOfflinePreparation();
    bind("prepareOfflineBtn",()=>startAutomaticOfflinePreparation({force:true,refresh:true}));
    bind("toggleHomeWeatherBtn",()=>{setWeatherEnabled(!weatherEnabled());openSettings();});
    const selectAccountAdminTab=type=>{
      const manager=type==="manager";
      document.getElementById("teacherAccountsPanel")?.toggleAttribute("hidden",manager);
      document.getElementById("managerAccountPanel")?.toggleAttribute("hidden",!manager);
      const teacherTab=document.getElementById("teacherAccountsTab"),managerTab=document.getElementById("managerAccountTab");
      teacherTab?.classList.toggle("active",!manager);teacherTab?.classList.toggle("secondary",manager);teacherTab?.setAttribute("aria-selected",String(!manager));
      managerTab?.classList.toggle("active",manager);managerTab?.classList.toggle("secondary",!manager);managerTab?.setAttribute("aria-selected",String(manager));
    };
    bind("teacherAccountsTab",()=>selectAccountAdminTab("teacher"));
    bind("managerAccountTab",()=>selectAccountAdminTab("manager"));
    const managerForm=document.getElementById("inviteManagerForm");
    if(managerForm) managerForm.onsubmit=async event=>{
      event.preventDefault();
      const button=managerForm.querySelector("button[type=submit]");button.disabled=true;
      try{
        const result=await teamAdminAction({action:"invite_manager",email:document.getElementById("inviteManagerEmail").value});
        await openSettings();
        document.getElementById("teacherAdminSection").open=true;
        selectAccountAdminTab("manager");
        document.getElementById("settingsOk").textContent=result.message;
      }catch(e){document.getElementById("settingsOk").textContent=e.message;button.disabled=false;}
    };
    bind("resetManagerPasswordBtn",async()=>{
      const result=await teamAdminAction({action:"reset_manager_password"});
      document.getElementById("settingsOk").textContent=result.message;
    });
    const inviteForm=document.getElementById("inviteTeacherForm");
    const envoyerInvitation=async action=>{
      const boutons=inviteForm.querySelectorAll("button");
      boutons.forEach(b=>b.disabled=true);
      try{
        const result=await teamAdminAction({action,name:document.getElementById("inviteTeacherName").value,email:document.getElementById("inviteTeacherEmail").value});
        document.getElementById("settingsOk").textContent=result.message;
        inviteForm.reset();
        // La liste des places reservees vient de changer : on rouvre pour l'afficher a jour.
        await openSettings();
      }catch(e){document.getElementById("settingsOk").textContent=e.message;}
      finally{boutons.forEach(b=>b.disabled=false);}
    };
    if(inviteForm) inviteForm.onsubmit=event=>{event.preventDefault();envoyerInvitation("reserve");};
    const inviteNow=document.getElementById("inviteAndSendBtn");
    if(inviteNow) inviteNow.onclick=()=>envoyerInvitation("invite");
    document.querySelectorAll(".sendPendingInviteBtn").forEach(button=>button.onclick=async()=>{
      const email=button.closest("[data-pending-email]").dataset.pendingEmail;
      button.disabled=true;
      try{
        const result=await teamAdminAction({action:"send_invite",email});
        document.getElementById("settingsOk").textContent=result.message;
      }catch(e){document.getElementById("settingsOk").textContent=e.message;}
      finally{button.disabled=false;}
    });
    document.querySelectorAll(".cancelPendingInviteBtn").forEach(button=>button.onclick=async()=>{
      const row=button.closest("[data-pending-email]"), email=row.dataset.pendingEmail;
      if(!confirm(`Annuler la réservation de ${email} ? Aucun mail ne lui a été envoyé.`))return;
      button.disabled=true;
      try{
        const result=await teamAdminAction({action:"cancel_invite",email});
        document.getElementById("settingsOk").textContent=result.message;
        await openSettings();
      }catch(e){ document.getElementById("settingsOk").textContent=e.message; }
      finally{ button.disabled=false; }
    });
    document.querySelectorAll(".switchTeacherBtn").forEach(button=>button.onclick=async()=>{
      const row=button.closest(".teacherAdminRow");
      button.disabled=true;
      try{ await basculerSurCompte(row.dataset.teacherId, row.querySelector("strong").textContent); }
      catch(e){ document.getElementById("settingsOk").textContent=e.message; }
      finally{ button.disabled=false; }
    });
    document.querySelectorAll(".resetTeacherPasswordBtn").forEach(button=>button.onclick=async()=>{button.disabled=true;try{const result=await teamAdminAction({action:"reset_password",target_id:button.closest(".teacherAdminRow").dataset.teacherId});document.getElementById("settingsOk").textContent=result.message;}catch(e){document.getElementById("settingsOk").textContent=e.message;}finally{button.disabled=false;}});
    document.querySelectorAll(".deleteTeacherBtn").forEach(button=>button.onclick=async()=>{const row=button.closest(".teacherAdminRow"),name=row.querySelector("strong").textContent;if(!confirm(`Supprimer définitivement le compte de ${name} et toutes ses données personnelles ? Les groupes et appels AS seront conservés.`))return;button.disabled=true;try{const result=await teamAdminAction({action:"delete",target_id:row.dataset.teacherId,confirm:true});row.remove();document.getElementById("settingsOk").textContent=result.message;}catch(e){document.getElementById("settingsOk").textContent=e.message;}finally{button.disabled=false;}});
    bind("settingsLogoutBtn",()=>document.getElementById("logoutBtn").click());
    bind("logoutAndEraseBtn",deconnecterEtEffacerCetAppareil);
    bind("settingsInstitutionBtn",()=>{document.getElementById("settingsOverlay").classList.remove("open");showTab("home");if(currentInstitution){document.getElementById("institutionCard").scrollIntoView({block:"center"});}else openInstitutionChooser();});
    bind("exportDataBtn",exportAllData);
    for(const [id,value] of [["basicVisualBtn",false],["interactiveVisualBtn",true]]) bind(id,async()=>{
      const next={...loadPrefs(),interactiveHomeEnabled:value,profilePending:true};savePrefs(next);applyHomeVisual();
      await sendTeacherProfile(next,settingsProfileRevision);await openSettings();
    });
    // Preference d'affichage propre a l'appareil : elle ne part pas dans le profil partage, qui
    // decrit l'enseignant et non son ecran.
    for(const [id,value] of [["palettePaleBtn",false],["paletteViveBtn",true]]) bind(id,()=>{
      savePrefs({...loadPrefs(),planningPaletteVive:value});
      if(typeof renderPlanningTab==="function" && document.getElementById("planningGrid")) renderPlanningTab();
      return openSettings();
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

  // Surface publique du module.
  globalThis.teacherPrefsKey = teacherPrefsKey;
  globalThis.readSettingsJson = readSettingsJson;
  globalThis.loadPrefs = loadPrefs;
  globalThis.savePrefs = savePrefs;
  globalThis.profileCacheKey = profileCacheKey;
  globalThis.profilePayload = profilePayload;
  globalThis.refreshTeacherProfile = refreshTeacherProfile;
  globalThis.refreshTeacherSettings = refreshTeacherSettings;
  globalThis.sendTeacherProfile = sendTeacherProfile;
  globalThis.settingsEscape = settingsEscape;
  globalThis.settingsSection = settingsSection;
  globalThis.nestedSettingsSection = nestedSettingsSection;
  globalThis.loadTeamContext = loadTeamContext;
  globalThis.oublierContexteEquipe = oublierContexteEquipe;
  globalThis.teamAdminAction = teamAdminAction;
  globalThis.openSettings = openSettings;
  globalThis.saveSettings = saveSettings;
  globalThis.resetSettingsData = resetSettingsData;
  globalThis.applyHomeVisual = applyHomeVisual;
})();
