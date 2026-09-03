/*
 * Compte et etablissement : connexion, lien de mot de passe, rattachement par code.
 *
 * Sorti d'index.html. Script classique, comme les dix autres fichiers du site :
 * les fonctions restent accessibles depuis les autres fichiers sans rien exporter,
 * et ce fichier est charge avant le script principal qui s'en sert.
 */

// ---- Auth ----
let isSignup = false;
let passwordLinkSession = null;
async function sendPasswordSetupLink(email) {
  const redirectTo = `${location.origin}${location.pathname}`;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.msg || body.message || "Impossible d’envoyer le lien de mot de passe.");
  }
}
async function preparePasswordLink() {
  const params = new URLSearchParams(location.hash.startsWith("#") ? location.hash.slice(1) : "");
  const type = params.get("type");
  const accessToken = params.get("access_token");
  if (!accessToken || !["invite", "recovery"].includes(type)) return false;
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` } });
  const user = await userResponse.json();
  if (!userResponse.ok || !user?.id) {
    history.replaceState(null, "", location.pathname + location.search);
    document.getElementById("authError").textContent = "Ce lien a expiré. Demandez à l’administrateur de renvoyer une invitation.";
    return false;
  }
  passwordLinkSession = { access_token: accessToken, refresh_token: params.get("refresh_token") || "", user, type };
  document.getElementById("authTitle").textContent = type === "invite" ? "Créer votre mot de passe" : "Choisir un nouveau mot de passe";
  document.getElementById("email").value = user.email || "";
  document.getElementById("email").readOnly = true;
  document.getElementById("password").value = "";
  document.getElementById("password").autocomplete = "new-password";
  document.getElementById("authSubmitBtn").textContent = "Enregistrer mon mot de passe";
  document.getElementById("authToggleBtn").style.display = "none";
  showAuthView();
  return true;
}
document.getElementById("authToggleBtn").addEventListener("click", () => {
  isSignup = !isSignup;
  document.getElementById("authTitle").textContent = isSignup ? "Creer un compte" : "Connexion";
  document.getElementById("authSubmitBtn").textContent = isSignup ? "Creer le compte" : "Se connecter";
  document.getElementById("authToggleBtn").textContent = isSignup ? "Deja un compte ? Se connecter" : "Pas encore de compte ? Creer un compte";
  document.getElementById("authError").textContent = "";
});

document.getElementById("authSubmitBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const errorEl = document.getElementById("authError");
  errorEl.className = "error";
  errorEl.textContent = "";
  if (passwordLinkSession) {
    if (password.length < 6) { errorEl.textContent = "Choisissez un mot de passe d’au moins 6 caractères."; return; }
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${passwordLinkSession.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const user = await res.json();
      if (!res.ok) throw new Error(user.msg || user.message || "Le mot de passe n’a pas été enregistré.");
      saveSession({ access_token: passwordLinkSession.access_token, refresh_token: passwordLinkSession.refresh_token, user_id: user.id, email: user.email });
      passwordLinkSession = null;
      history.replaceState(null, "", location.pathname + location.search);
      showMainView();
    } catch (e) { errorEl.textContent = e.message; }
    return;
  }
  if (!email || password.length < 6) {
    errorEl.textContent = "Email requis, mot de passe d'au moins 6 caracteres.";
    return;
  }
  const path = isSignup ? "/auth/v1/signup" : "/auth/v1/token?grant_type=password";
  try {
    const res = await fetch(SUPABASE_URL + path, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      const rawMessage = data.error_description || data.msg || data.message || "Echec de l'authentification.";
      if (isSignup && /already registered|already exists|déjà enregistré/i.test(rawMessage)) {
        await sendPasswordSetupLink(email);
        isSignup = false;
        document.getElementById("authTitle").textContent = "Compte déjà invité";
        document.getElementById("authSubmitBtn").textContent = "Se connecter";
        document.getElementById("authToggleBtn").textContent = "Pas encore de compte ? Créer un compte";
        errorEl.className = "ok";
        errorEl.textContent = "Cette adresse a déjà été invitée. Un nouveau lien vient d’être envoyé : ouvrez-le pour choisir votre mot de passe. Vous ne devez pas recréer le compte.";
        return;
      }
      throw new Error(rawMessage);
    }
    if (!data.access_token) {
      errorEl.textContent = isSignup ? "Compte cree. Verifiez vos emails si une confirmation est requise, puis connectez-vous." : "Reponse inattendue du serveur.";
      return;
    }
    saveSession({ access_token: data.access_token, user_id: data.user.id, email: data.user.email });
    justSignedUp = isSignup;
    showMainView();
  } catch (e) {
    errorEl.className = "error";
    errorEl.textContent = e.message;
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  // Sinon un retour serait propose au prochain visiteur de ce navigateur.
  localStorage.removeItem(ADMIN_SESSION_KEY);
  document.getElementById("impersonationBar").style.display = "none";
  // Sans attente, l'effacement pouvait tomber au milieu d'une synchronisation en cours et lui
  // laisser enregistrer un curseur apres coup : la copie restait vide, et plus rien ne se
  // chargeait. Le moteur s'en protege desormais, mais attendre ici supprime la course elle-meme.
  modeHorsConnexion?.oublierDonneesLocales().catch(() => {});
  clearSession();
  showAuthView();
});

function showAuthView() {
  document.getElementById("authView").style.display = "flex";
  document.getElementById("mainView").style.display = "none";
  document.getElementById("logoutBtn").style.display = "none";
  document.getElementById("searchBtn").style.display = "none";
  document.getElementById("settingsBtn").style.display = "none";
  document.getElementById("tabbar").style.display = "none";
}
function showMainView() {
  document.getElementById("authView").style.display = "none";
  document.getElementById("mainView").style.display = "block";
  document.getElementById("logoutBtn").style.display = "inline-block";
  document.getElementById("searchBtn").style.display = "inline-block";
  document.getElementById("settingsBtn").style.display = "inline-block";
  document.getElementById("tabbar").style.display = "flex";
  showTab("home");
  renderImpersonationBar();
  demarrerModeHorsConnexion();
  refreshTeacherSettings().then(() => { if(currentWebTab === "home") showTab("home"); }).catch(e => console.warn(e.message));
  loadInstitution();
  maybeLock();
}

// ---- Etablissement : rattachement par code (n'importe qui peut creer un etablissement en
// choisissant son propre code ; les collegues rejoignent en saisissant ce meme code). ----
let justSignedUp = false;
let currentInstitution = null;

async function loadInstitution() {
  const statusEl = document.getElementById("institutionStatus");
  const res = await apiFetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user_id}&select=institution_id,institutions(name,code)`);
  const rows = res.ok ? await res.json() : [];
  currentInstitution = rows[0]?.institutions || null;
  renderInstitutionCard();
  if (justSignedUp) {
    justSignedUp = false;
    if (!currentInstitution) openInstitutionPrompt();
  }
}

function renderInstitutionCard() {
  const statusEl = document.getElementById("institutionStatus");
  if (currentInstitution) {
    statusEl.innerHTML = `Rattache a <strong>${currentInstitution.name}</strong> (code ${currentInstitution.code}).
      <button class="secondary" id="institutionLeaveBtn" style="margin-top:10px">Quitter cet etablissement</button>`;
    document.getElementById("institutionLeaveBtn").addEventListener("click", async () => {
      await apiFetch(`${SUPABASE_URL}/rest/v1/rpc/leave_institution`, { method: "POST", body: JSON.stringify({}) });
      currentInstitution = null;
      renderInstitutionCard();
    });
  } else {
    statusEl.innerHTML = `Non rattache. Le Planning et la Programmation annuelle ne se partagent qu'entre collegues du meme etablissement.
      <button id="institutionLinkBtn" style="margin-top:10px">Se rattacher a un etablissement</button>`;
    document.getElementById("institutionLinkBtn").addEventListener("click", openInstitutionChooser);
  }
}

function openInstitutionPrompt() {
  const panel = document.getElementById("institutionPanel");
  panel.innerHTML = `
    <h2>Rattacher ce compte a un etablissement ?</h2>
    <div class="muted" style="margin-bottom:10px">Cela permet de partager le Planning et la Programmation annuelle avec vos collegues du meme etablissement, et seulement eux.</div>
    <button id="institutionPromptYesBtn">Oui</button>
    <button class="secondary" id="institutionPromptNoBtn">Non merci</button>`;
  panel.style.display = "block";
  document.getElementById("institutionPromptYesBtn").addEventListener("click", openInstitutionChooser);
  document.getElementById("institutionPromptNoBtn").addEventListener("click", () => panel.style.display = "none");
}

function openInstitutionChooser() {
  const panel = document.getElementById("institutionPanel");
  panel.innerHTML = `
    <h2>Etablissement</h2>
    <button id="institutionCreateBtn">Creer un nouvel etablissement</button>
    <button id="institutionJoinBtn">Rejoindre avec un code</button>
    <button class="secondary" id="institutionCancelBtn">Annuler</button>`;
  panel.style.display = "block";
  document.getElementById("institutionCreateBtn").addEventListener("click", openInstitutionCreateForm);
  document.getElementById("institutionJoinBtn").addEventListener("click", openInstitutionJoinForm);
  document.getElementById("institutionCancelBtn").addEventListener("click", () => panel.style.display = "none");
}

function openInstitutionCreateForm() {
  const panel = document.getElementById("institutionPanel");
  panel.innerHTML = `
    <h2>Creer un etablissement</h2>
    <label for="institutionName">Nom (ex : Lycee Victor Hugo)</label>
    <input type="text" id="institutionName">
    <label for="institutionCode">Code (au choix, a partager avec vos collegues)</label>
    <input type="text" id="institutionCode" placeholder="Ex : 32320">
    <button id="institutionCreateSubmitBtn">Creer</button>
    <button class="secondary" id="institutionCreateCancelBtn">Annuler</button>
    <div class="error" id="institutionCreateError"></div>`;
  panel.style.display = "block";
  document.getElementById("institutionCreateCancelBtn").addEventListener("click", () => panel.style.display = "none");
  document.getElementById("institutionCreateSubmitBtn").addEventListener("click", async () => {
    const name = document.getElementById("institutionName").value.trim();
    const code = document.getElementById("institutionCode").value.trim();
    const errorEl = document.getElementById("institutionCreateError");
    errorEl.textContent = "";
    if (!name || !code) { errorEl.textContent = "Nom et code requis."; return; }
    const res = await apiFetch(`${SUPABASE_URL}/rest/v1/rpc/create_institution`, {
      method: "POST", body: JSON.stringify({ p_name: name, p_code: code })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errorEl.textContent = (data.message || "").includes("duplicate") ? "Ce code est deja utilise par un autre etablissement." : (data.message || "Erreur lors de la creation.");
      return;
    }
    panel.style.display = "none";
    await loadInstitution();
  });
}

function openInstitutionJoinForm() {
  const panel = document.getElementById("institutionPanel");
  panel.innerHTML = `
    <h2>Rejoindre un etablissement</h2>
    <label for="institutionJoinCode">Code fourni par un collegue</label>
    <input type="text" id="institutionJoinCode">
    <button id="institutionJoinSubmitBtn">Rejoindre</button>
    <button class="secondary" id="institutionJoinCancelBtn">Annuler</button>
    <div class="error" id="institutionJoinError"></div>`;
  panel.style.display = "block";
  document.getElementById("institutionJoinCancelBtn").addEventListener("click", () => panel.style.display = "none");
  document.getElementById("institutionJoinSubmitBtn").addEventListener("click", async () => {
    const code = document.getElementById("institutionJoinCode").value.trim();
    const errorEl = document.getElementById("institutionJoinError");
    errorEl.textContent = "";
    if (!code) { errorEl.textContent = "Code requis."; return; }
    const res = await apiFetch(`${SUPABASE_URL}/rest/v1/rpc/join_institution_by_code`, {
      method: "POST", body: JSON.stringify({ p_code: code })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errorEl.textContent = data.message || "Code introuvable.";
      return;
    }
    panel.style.display = "none";
    await loadInstitution();
  });
}
