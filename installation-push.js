/* Opt-in only. Missing server configuration is reported, never shown as activated. */
(function(){
  const KEY='eps_installation_push_device';
  function device(){let id=localStorage.getItem(KEY);if(!id){id=crypto.randomUUID();localStorage.setItem(KEY,id)}return id}
  async function mount(host,api,userId) {
    if(!host || !userId)return;
    const previous=host.querySelector('[data-push-enable]')?.parentElement;
    if(previous?.dataset.pushUser===userId)return;
    previous?.remove();
    const box=document.createElement('div');box.className='field-tool-row';box.dataset.pushUser=userId;
    box.innerHTML='<button type="button" class="secondary" data-push-enable>Activer les notifications</button><button type="button" class="secondary" data-push-disable>Désactiver</button><small data-push-message></small>';
    host.append(box);const message=box.querySelector('[data-push-message]');
    box.querySelector('[data-push-enable]').onclick=async()=>{
      try{
        if(!('serviceWorker' in navigator)||!('PushManager' in window))throw Error('Notifications non prises en charge par ce navigateur.');
        const config=await api('/rest/v1/rpc/eps_push_public_config',{method:'POST',body:'{}'});
        if(!config?.vapid_public_key)throw Error('Le service d’envoi EPS doit encore être configuré.');
        if(await Notification.requestPermission()!=='granted')throw Error('Autorisez les notifications dans les réglages du navigateur.');
        const registration=await navigator.serviceWorker.ready;
        const key=config.vapid_public_key.replace(/-/g,'+').replace(/_/g,'/');
        const binary=atob(key+'='.repeat((4-key.length%4)%4));
        const subscription=await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(binary,c=>c.charCodeAt(0))});
        // Bind this browser to exactly one active account, including in the worker.
        const cache=await caches.open('eps-push-identity');await cache.put(new Request(new URL('push-account',location.href)),new Response(userId));
        await api('/rest/v1/rpc/eps_push_register',{method:'POST',body:JSON.stringify({p_device_key:device(),p_platform:'web',p_subscription:subscription.toJSON()})});
        message.textContent='Notifications activées sur cet appareil.';
      }catch(e){message.textContent='Non activées : '+e.message}
    };
    box.querySelector('[data-push-disable]').onclick=async()=>{try{await api('/rest/v1/rpc/eps_push_unregister',{method:'POST',body:JSON.stringify({p_device_key:device()})});await clear();message.textContent='Notifications désactivées.'}catch(e){message.textContent='Désactivation non confirmée : '+e.message}};
  }
  async function clear(){await caches.delete('eps-push-identity');if('serviceWorker'in navigator){const r=await navigator.serviceWorker.getRegistration();await(await r?.pushManager.getSubscription())?.unsubscribe()}}
  async function teacherMount(){const host=document.querySelector('#tab-equipement')||document.querySelector('[data-tab-content="equipement"]');if(!host||!session?.user_id)return;await mount(host,async(path,options)=>{const r=await apiFetch(SUPABASE_URL+path,options);if(!r.ok)throw Error('Configuration indisponible ('+r.status+').');return r.status===204?null:r.json()},session.user_id)}
  globalThis.EpsInstallationPush={mount,clear,teacherMount};
})();
