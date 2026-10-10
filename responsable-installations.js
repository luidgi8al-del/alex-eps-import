/* Espace responsable autonome : aucun écran professeur n'est chargé ici. Les droits réels
 * restent appliqués par Supabase (migration 20261008010000_installation_shared_manager.sql). */
(() => {
  const BASE = 'https://griahowpsuxbmdywiktj.supabase.co';
  const KEY = 'sb_publishable__G61lzydHXYaYZ4rJQhO5Q_hM0J2C_u';
  const SESSION_KEY = 'eps_installation_manager_session';
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const date = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}) : '';
  let session = null;
  let reports = [];
  let facilities = [];
  let filter = 'all';
  let openedId = null;
  let openedFacility = null;
  let detailOrigin = 'reports';
  let passwordLinkSession = null;
  let refreshing = null;

  const androidSession = new URLSearchParams(location.search).has('android');
  if (!androidSession) { try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { session = null; } }
  else localStorage.removeItem(SESSION_KEY);
  const saveSession = value => { session = value; !androidSession && value ? localStorage.setItem(SESSION_KEY, JSON.stringify(value)) : localStorage.removeItem(SESSION_KEY); };
  const show = view => { ['authPage','pendingPage','managerPage'].forEach(id => $(id).hidden = id !== view); };
  const message = (value, error = false) => { $('statusMessage').textContent = value; $('statusMessage').className = error ? 'message error' : 'message'; };
  const authMessage = value => { $('authMessage').textContent = value; };

  async function renew() {
    if (!session?.refresh_token) return false;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const response = await fetch(`${BASE}/auth/v1/token?grant_type=refresh_token`, {
          method:'POST', headers:{apikey:KEY,'Content-Type':'application/json'},
          body:JSON.stringify({refresh_token:session.refresh_token})
        });
        const data = await response.json();
        if (!response.ok || !data.access_token) return false;
        saveSession({access_token:data.access_token, refresh_token:data.refresh_token, email:data.user?.email || session.email});
        return true;
      } catch { return false; }
      finally { refreshing = null; }
    })();
    return refreshing;
  }

  async function api(path, options = {}, retry = true) {
    const response = await fetch(BASE + path, {
      ...options,
      headers:{apikey:KEY,Authorization:`Bearer ${session?.access_token || KEY}`,'Content-Type':'application/json',...(options.headers || {})}
    });
    if (response.status === 401 && retry && await renew()) return api(path, options, false);
    if (response.status === 401) { logout(); throw new Error('Session expirée. Reconnectez-vous.'); }
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    if (!response.ok) throw new Error(data?.message || data?.error_description || `Erreur ${response.status}`);
    return data;
  }

  async function authenticate() {
    if (!session?.access_token) { show('authPage'); return; }
    try {
      const context = await api('/rest/v1/rpc/eps_installation_manager_context', {method:'POST',body:'{}'});
      if (!context?.is_manager) { show('pendingPage'); return; }
      show('managerPage');
      if(!androidSession) await globalThis.EpsInstallationPush?.mount($('managerPage'),api,session.user_id || session.user?.id || JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub);
      await load();
    } catch (error) {
      if (session) { show('pendingPage'); $('pendingPage').querySelector('p').textContent = `Impossible de vérifier les droits : ${error.message}. Réessayez quand la connexion sera rétablie.`; }
    }
  }

  async function load() {
    try {
      const [allReports, allFacilities] = await Promise.all([
        api('/rest/v1/sport_installation_incidents?deleted=eq.false&select=*&order=reported_at.desc'),
        api('/rest/v1/rpc/eps_installation_facilities', {method:'POST',body:'{}'})
      ]);
      reports = Array.isArray(allReports) ? allReports : [];
      facilities = Array.isArray(allFacilities) ? allFacilities.map(row => row.name).filter(Boolean) : [];
      render();
      message('');
      if (openedId) await showReport(openedId, true);
      else if (openedFacility) showFacility(openedFacility, true);
    } catch (error) { message(`Chargement impossible : ${error.message}`, true); }
  }

  const status = value => ({A_ENVOYER:'À envoyer',SIGNALE:'À traiter',EN_COURS:'Pris en charge',RESOLU:'Résolu'}[value] || value);
  function render() {
    $('pendingCount').textContent = reports.filter(row => row.status === 'SIGNALE' || row.status === 'A_ENVOYER').length;
    $('progressCount').textContent = reports.filter(row => row.status === 'EN_COURS').length;
    $('resolvedCount').textContent = reports.filter(row => row.status === 'RESOLU').length;
    document.querySelectorAll('[data-filter]').forEach(button => button.classList.toggle('active', button.dataset.filter === filter));
    const visible = reports.filter(row => filter !== 'urgent' || row.urgency === 'URGENT');
    $('reportsList').innerHTML = visible.length ? visible.map(row => `<article class="report-card">
      <div class="report-head"><h3>${escape(row.description)}</h3><span class="badge ${row.urgency === 'URGENT' ? 'urgent' : 'normal'}">${row.urgency === 'URGENT' ? 'Urgent' : 'Normal'}</span></div>
      <p>${escape(row.installation_name)} · ${escape(status(row.status))}<br>${escape(date(row.reported_at))}${row.reported_by ? ` · ${escape(row.reported_by)}` : ''}</p>
      <button type="button" class="secondary" data-report="${escape(row.id)}">Voir le suivi</button>
    </article>`).join('') : `<div class="empty">${filter === 'urgent' ? 'Aucun signalement urgent.' : 'Aucun signalement pour le moment.'}</div>`;
    $('facilityList').innerHTML = facilities.length ? facilities.map(name => {
      const count = reports.filter(row => row.installation_name === name && row.status !== 'RESOLU').length;
      return `<article class="facility-card"><div><h3>${escape(name)}</h3><p>${count} signalement${count > 1 ? 's' : ''} actif${count > 1 ? 's' : ''}</p></div><button type="button" class="secondary" data-facility="${escape(name)}">Suivi</button></article>`;
    }).join('') : '<div class="empty">Aucune installation enregistrée.</div>';
    document.querySelectorAll('[data-report]').forEach(button => button.onclick = () => showReport(button.dataset.report));
    document.querySelectorAll('[data-facility]').forEach(button => button.onclick = () => showFacility(button.dataset.facility));
  }

  function view(name) {
    $('reportsView').hidden = name !== 'reports';
    $('facilitiesView').hidden = name !== 'facilities';
    $('detailView').hidden = name !== 'detail';
    $('reportsTab').classList.toggle('active', name === 'reports');
    $('facilitiesTab').classList.toggle('active', name === 'facilities');
  }

  async function showReport(id, noScroll = false) {
    const row = reports.find(item => item.id === id);
    if (!row) return;
    detailOrigin = openedFacility ? 'facilities' : 'reports';
    openedId = id; openedFacility = null;
    view('detail');
    const action = row.status === 'SIGNALE' || row.status === 'A_ENVOYER' ? '<button type="button" data-next="EN_COURS">Pris en charge</button>' : row.status === 'EN_COURS' ? '<button type="button" data-next="RESOLU">Marquer comme résolu</button>' : '';
    $('detailContent').innerHTML = `<div class="detail-card"><h2>${escape(row.description)}</h2>
      ${InstallationPhoto.html(row.photo_data)}
      <p class="detail-meta">${escape(row.installation_name)} · ${escape(date(row.reported_at))} · ${escape(status(row.status))}</p>
      <p><span class="badge ${row.urgency === 'URGENT' ? 'urgent' : 'normal'}">${row.urgency === 'URGENT' ? 'Urgent' : 'Normal'}</span>${row.reported_by ? ` · Signalé par ${escape(row.reported_by)}` : ''}</p>
      ${action ? `<label for="interventionNote">Note d’intervention (facultative)</label><textarea id="interventionNote" class="detail-note" placeholder="Ce qui a été fait ou reste à faire"></textarea><div class="detail-actions">${action}</div>` : ''}
      <p id="detailError" class="detail-error" role="alert"></p><div id="reportTimeline" class="timeline"></div></div>`;
    const button = $('detailContent').querySelector('[data-next]');
    if (button) button.onclick = async () => {
      button.disabled = true;
      try {
        await api('/rest/v1/rpc/eps_update_installation_report', {method:'POST',body:JSON.stringify({p_incident_id:id,p_status:button.dataset.next,p_note:$('interventionNote').value.trim()})});
        await load();
      } catch (error) { $('detailError').textContent = error.message; button.disabled = false; }
    };
    try {
      const history = await api(`/rest/v1/eps_installation_interventions?incident_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.asc`);
      $('reportTimeline').innerHTML = `<div class="timeline-item"><strong>Signalé</strong><small>${escape(date(row.reported_at))}</small></div>` + history.map(event => `<div class="timeline-item"><strong>${escape(status(event.status))}</strong><small>${escape(date(event.created_at))}</small>${event.note ? `<p>${escape(event.note)}</p>` : ''}</div>`).join('');
    } catch (error) { $('reportTimeline').textContent = `Historique indisponible : ${error.message}`; }
    if (!noScroll) window.scrollTo({top:0,behavior:'smooth'});
  }

  function showFacility(name, noScroll = false) {
    openedFacility = name; openedId = null;
    view('detail');
    const visible = reports.filter(row => row.installation_name === name);
    $('detailContent').innerHTML = `<div class="section-heading"><h2>${escape(name)}</h2></div><div class="report-grid">${visible.length ? visible.map(row => `<article class="report-card"><div class="report-head"><h3>${escape(row.description)}</h3><span class="badge ${row.urgency === 'URGENT' ? 'urgent' : 'normal'}">${row.urgency === 'URGENT' ? 'Urgent' : 'Normal'}</span></div><p>${escape(status(row.status))} · ${escape(date(row.reported_at))}</p><button class="secondary" data-report="${escape(row.id)}">Voir le suivi</button></article>`).join('') : '<div class="empty">Aucune intervention pour cette installation.</div>'}</div>`;
    $('detailContent').querySelectorAll('[data-report]').forEach(button => button.onclick = () => showReport(button.dataset.report));
    if (!noScroll) window.scrollTo({top:0,behavior:'smooth'});
  }

  function logout() {
    globalThis.EpsInstallationPush?.clear().catch(()=>{});
    try {
      const teacherSession = JSON.parse(localStorage.getItem('alex_eps_session') || 'null');
      if (teacherSession?.access_token === session?.access_token) localStorage.removeItem('alex_eps_session');
    } catch { /* Aucune autre session à toucher. */ }
    saveSession(null); openedId = null; openedFacility = null; show('authPage');
    if (new URLSearchParams(location.search).has('android')) window.AndroidInstallation?.logout();
  }

  async function preparePasswordLink() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const type = params.get('type');
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken || !['invite','recovery'].includes(type)) return false;
    try {
      const response = await fetch(`${BASE}/auth/v1/user`, {headers:{apikey:KEY,Authorization:`Bearer ${accessToken}`}});
      const user = await response.json();
      if (!response.ok || !user?.email) throw new Error('Ce lien a expiré. Demandez un nouveau lien au professeur administrateur.');
      passwordLinkSession = {access_token:accessToken,refresh_token:refreshToken,email:user.email};
      show('authPage');
      $('authTitle').textContent = type === 'invite' ? 'Créer votre mot de passe' : 'Choisir un nouveau mot de passe';
      $('loginEmail').value = user.email;
      $('loginEmail').readOnly = true;
      $('loginPassword').value = '';
      $('loginPassword').autocomplete = 'new-password';
      $('loginSubmit').textContent = 'Enregistrer mon mot de passe';
      $('recoverPassword').hidden = true;
      authMessage('Choisissez un mot de passe d’au moins 6 caractères.');
      return true;
    } catch (error) {
      show('authPage');
      authMessage(error.message);
      history.replaceState(null,'',location.pathname + location.search);
      return true;
    }
  }

  $('loginForm').onsubmit = async event => {
    event.preventDefault();
    const email = $('loginEmail').value.trim(), password = $('loginPassword').value;
    try {
      if (passwordLinkSession) {
        if (password.length < 6) throw new Error('Le mot de passe doit contenir au moins 6 caractères.');
        authMessage('Enregistrement du mot de passe…');
        const response = await fetch(`${BASE}/auth/v1/user`, {
          method:'PUT',headers:{apikey:KEY,Authorization:`Bearer ${passwordLinkSession.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({password})
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error_description || data.msg || data.message || 'Le mot de passe n’a pas pu être enregistré.');
        saveSession(passwordLinkSession);
        passwordLinkSession = null;
        history.replaceState(null,'',location.pathname + location.search);
        authMessage('');
        await authenticate();
        return;
      }
      authMessage('Connexion en cours…');
      const response = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
        method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error_description || data.msg || data.message || 'Connexion impossible.');
      saveSession({access_token:data.access_token,refresh_token:data.refresh_token,email});
      authMessage(''); await authenticate();
    } catch (error) { authMessage(error.message); }
  };
  $('recoverPassword').onclick = async () => {
    const email = $('loginEmail').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { authMessage('Saisissez d’abord votre adresse e-mail.'); return; }
    authMessage('Envoi en cours…');
    try {
      const redirect = `${location.origin}${location.pathname}`;
      const response = await fetch(`${BASE}/auth/v1/recover?redirect_to=${encodeURIComponent(redirect)}`, {
        method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({email})
      });
      if (!response.ok) throw new Error('Le lien n’a pas pu être envoyé. Réessayez plus tard.');
      authMessage('Si cette adresse est autorisée, un lien sécurisé vient d’être envoyé.');
    } catch (error) { authMessage(error.message); }
  };
  $('logoutBtn').onclick = logout;
  $('pendingLogout').onclick = logout;
  $('pendingRetry').onclick = authenticate;
  $('reportsTab').onclick = () => { openedId = null; openedFacility = null; view('reports'); };
  $('facilitiesTab').onclick = () => { openedId = null; openedFacility = null; view('facilities'); };
  $('detailBack').onclick = () => { openedId = null; openedFacility = null; view(detailOrigin); };
  document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { filter = button.dataset.filter; render(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('managerPage').hidden) load(); });
  setInterval(() => { if (!document.hidden && !$('managerPage').hidden) load(); }, 30000);
  if (new URLSearchParams(location.search).has('android')) {
    authMessage('Connexion au compte de l’application…');
    window.installationAndroidSession = value => { saveSession(value); authenticate(); };
  } else {
    preparePasswordLink().then(found => { if (!found) authenticate(); });
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
})();
