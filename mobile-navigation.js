/* Device-only display preference. Never sent in the shared teacher profile. */
(function () {
  const KEY = 'eps:device-display-mode';
  const MODES = ['auto', 'mobile', 'desktop'];
  const media = matchMedia('(max-width: 650px)');
  const main = document.getElementById('mainView');
  let mode = 'auto', resumeOwner = null, previousFocus = null;
  try { const saved = localStorage.getItem(KEY); if (MODES.includes(saved)) mode = saved; } catch {}
  const paths = {
    home:'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
    unss:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    outils:'M10 2h4M12 8v5l3 2M19 6l1-1M21 13a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    equipement:'M3 7l9-5 9 5v10l-9 5-9-5V7M3 7l9 5 9-5M12 12v10M7 4.8l10 5.5',
    planning:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2',
    plus:'M4 6h16M4 12h16M4 18h16',
    history:'M3 3v6h6M3.5 9a9 9 0 1 1 1 10M12 7v5l3 2',
    classes:'M2 8l10-5 10 5-10 5-10-5M6 10v7l6 4 6-4v-7M22 8v7',
    health:'M3 12h4l3-8 4 16 3-8h4',
    settings:'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.plus}"/></svg>`;
  const home = document.createElement('section');
  home.id = 'mobileHome'; home.hidden = true; home.setAttribute('aria-label', 'Accueil mobile');
  home.innerHTML = `<div class="mobile-home-intro"><p class="mobile-eyebrow">Votre espace enseignant</p><h1 id="mobileGreeting">Bonjour.</h1><p>Tout pour votre pratique au quotidien.</p></div><div class="mobile-home-links">${[
    ['unss','ASLVH','Inscriptions et activités'],['outils','Outils','Chronos, observations et évaluations'],['equipement','Équipement','Installations, matériel et EPI'],['planning','Planning','Emploi du temps et séances']
  ].map(([tab,title,sub]) => `<button type="button" class="mobile-home-link ${tab==='outils'?'mobile-feature':''}" data-mobile-tab="${tab}"><span class="mobile-symbol">${icon(tab)}</span><span><strong>${title}</strong><small>${sub}</small></span><span class="mobile-arrow" aria-hidden="true">›</span></button>`).join('')}</div><div class="mobile-home-resume"><div class="tools-resume-slot"></div></div><p id="mobileResumeStatus" role="status"></p>`;
  document.getElementById('tab-home').prepend(home);
  const nav = document.createElement('nav'); nav.id = 'mobileBottomNav'; nav.hidden = true; nav.setAttribute('aria-label','Navigation principale mobile');
  nav.innerHTML = [['home','Accueil'],['unss','ASLVH'],['outils','Outils'],['equipement','Équipement'],['plus','Plus']].map(([tab,title]) => `<button type="button" data-mobile-tab="${tab}"><span>${icon(tab)}</span><small>${title}</small></button>`).join('');
  main.append(nav);
  const overlay = document.createElement('div'); overlay.id = 'mobileMoreOverlay'; overlay.className = 'searchOverlay ui-modal-overlay';
  overlay.innerHTML = `<section class="searchSheet ui-modal" role="dialog" aria-modal="true" aria-labelledby="mobileMoreTitle"><div class="top ui-modal-head"><h2 id="mobileMoreTitle">Plus</h2><button type="button" class="ui-modal-close" id="mobileMoreClose" aria-label="Fermer le menu">×</button></div><div class="ui-modal-body mobile-more-links">${[['planning','Planning'],['classes','Classe'],['health','Santé / Accident'],['cours','Cours'],['programmation','Programmation'],['students','Élèves'],['emails','E-mails'],['settings','Réglages'],['help','Aide']].map(([tab,title])=>`<button type="button" class="secondary" data-mobile-tab="${tab}">${icon(tab)}<span>${title}</span><span aria-hidden="true">›</span></button>`).join('')}<button type="button" class="secondary" id="mobileSearch">Rechercher</button><button type="button" class="secondary" id="mobileLogout">Se déconnecter</button></div></section>`;
  document.body.append(overlay);
  function closeMore(restore = true) { overlay.classList.remove('open'); if (restore && previousFocus?.isConnected) previousFocus.focus(); }
  function more() { previousFocus = document.activeElement; overlay.classList.add('open'); document.getElementById('mobileMoreClose').focus(); }
  function update() {
    const signedIn = main.style.display !== 'none' && typeof session !== 'undefined' && !!session?.user_id;
    const simple = signedIn && (mode === 'mobile' || mode === 'auto' && media.matches);
    document.body.classList.toggle('mobile-simple', simple);
    document.documentElement.dataset.deviceDisplay = mode;
    home.hidden = !simple; nav.hidden = !simple;
    if (!simple) closeMore(false);
    if (!signedIn) { resumeOwner = null; home.querySelector('.tools-resume-slot').replaceChildren(); }
    const selected = typeof currentWebTab !== 'undefined' ? currentWebTab : 'home';
    nav.querySelectorAll('button').forEach(b => {
      const active = b.dataset.mobileTab === selected || b.dataset.mobileTab === 'plus' && !['home','unss','outils','equipement'].includes(selected);
      b.setAttribute('aria-current', active ? 'page' : 'false');
    });
    if (simple && selected === 'home') {
      const teacher = typeof loadPrefs === 'function' ? loadPrefs().teacherName : '';
      document.getElementById('mobileGreeting').textContent = teacher ? `Bonjour ${teacher}.` : 'Bonjour.';
      const account = session.user_id;
      if (resumeOwner !== account && globalThis.EpsToolResume) {
        resumeOwner = account;
        void EpsToolResume.offer(home, {beforeOpen: () => showTab('outils')});
      }
    }
    if (typeof mesurerEntete === 'function') mesurerEntete();
  }
  function setMode(value) {
    if (!MODES.includes(value)) return;
    try { localStorage.setItem(KEY, value); } catch { throw Error('Le choix d’affichage ne peut pas être conservé sur cet appareil.'); }
    mode = value; update();
  }
  function settings(host) {
    if (!host || host.querySelector('#deviceDisplayMode')) return;
    const field = document.createElement('div'); field.className = 'device-display-settings';
    field.innerHTML = `<label for="deviceDisplayMode">Mode d’affichage</label><select id="deviceDisplayMode"><option value="auto">Automatique</option><option value="mobile">Mobile simplifié</option><option value="desktop">Ordinateur complet</option></select><p class="muted">Automatique adapte l’accueil et la navigation à la largeur de l’écran. Ce choix reste sur cet appareil et ne change pas vos autres appareils.</p><p id="deviceDisplayStatus" role="status"></p>`;
    host.prepend(field); const select = field.querySelector('select'); select.value = mode;
    select.onchange = () => { try { setMode(select.value); field.querySelector('[role=status]').textContent = 'Affichage enregistré sur cet appareil.'; } catch(e) { select.value = mode; field.querySelector('[role=status]').textContent = e.message; } };
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-mobile-tab]'); if (!b) return;
    const tab = b.dataset.mobileTab;
    if (tab === 'plus') { more(); return; }
    closeMore(false); showTab(tab); update();
  });
  document.getElementById('mobileMoreClose').onclick = () => closeMore();
  overlay.addEventListener('click', e => { if (e.target === overlay) closeMore(); });
  overlay.addEventListener('keydown', e => {
    if(e.key === 'Escape') { e.preventDefault(); closeMore(); }
    if(e.key === 'Tab') { const buttons = [...overlay.querySelectorAll('button')]; const first=buttons[0],last=buttons[buttons.length-1]; if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();} }
  });
  document.getElementById('mobileSearch').onclick = () => { closeMore(false); openSearch(); };
  document.getElementById('mobileLogout').onclick = () => { closeMore(false); document.getElementById('logoutBtn').click(); };
  media.addEventListener('change', update);
  window.addEventListener('storage', e => { if(e.key === KEY) { mode = MODES.includes(e.newValue)?e.newValue:'auto'; update(); } });
  new MutationObserver(update).observe(main, {attributes:true,attributeFilter:['style']});
  globalThis.EpsMobileDisplay = {update,setMode,settings,getMode:()=>mode,resetResume:()=>{resumeOwner=null;}};
  update();
})();
