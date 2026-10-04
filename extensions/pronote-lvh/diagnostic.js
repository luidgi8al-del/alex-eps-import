(() => {
  'use strict';
  if (location.origin !== 'https://3500010j.index-education.net' || !location.pathname.startsWith('/pronote/')) return;
  globalThis.EpsPronoteDiagnostic?.close();
  const host = document.createElement('div'); host.id = 'eps-pronote-diagnostic';
  host.style.cssText = 'position:fixed;right:12px;top:12px;z-index:2147483647;width:min(390px,94vw)';
  const root = host.attachShadow({mode:'open'});
  root.innerHTML = `<style>:host{font:15px system-ui;color:#163c54}section{background:white;border:2px solid #087dca;border-radius:16px;padding:18px;box-shadow:0 8px 30px #0004}button{padding:10px;margin:5px;border-radius:8px;border:1px solid #087dca;background:#edf7ff;color:#163c54}textarea{width:100%;height:120px;box-sizing:border-box}p{line-height:1.4}</style><section><b>Diagnostic PRONOTE · lecture seule</b><p>1. Cliquez sur Démarrer.<br>2. Ouvrez une case vide comme pour saisir une note, sans rien écrire.<br>3. Revenez ici et téléchargez le diagnostic.</p><p>Aucune note saisie par cet outil. Aucun nom, texte de page, contenu de champ, cookie ou identifiant de connexion collecté. Aucun envoi automatique.</p><button id="start">Démarrer</button><button id="stop">Arrêter</button><button id="download">Télécharger le diagnostic</button><button id="close">Fermer</button><p id="status" role="status">Prêt. Observation limitée à 60 secondes.</p><details><summary>Voir le rapport technique</summary><textarea id="report" readonly aria-label="Rapport technique"></textarea></details></section>`;
  document.documentElement.append(host);
  const report = {format:'eps-pronote-diagnostic-v1',extensionVersion:'0.1.1',events:[]};
  let running=false, timer, pending, observer, seen=new Set();
  const $ = id => root.getElementById(id);
  // Deliberately no textContent, value, name, placeholder, URL, cookies or storage from the page.
  const describe = el => ({tag:el.tagName.toLowerCase(),role:el.getAttribute('role'),
    id: /^IE\.[A-Za-z0-9_.\[\]-]+$/.test(el.id) ? el.id : el.id ? '[masqué]' : null,
    classes:[...el.classList].filter(c=>/^(liste[-_]|Alignement|SansMain|Objet)/.test(c)).slice(0,15),
    type:el instanceof HTMLInputElement ? el.type : null,
    editable:el.isContentEditable,disabled:!!el.disabled,readOnly:!!el.readOnly,
    column: /^\d+$/.test(el.getAttribute('data-colonne')||'') ? el.getAttribute('data-colonne') : null,
    visible:!!el.getClientRects().length && getComputedStyle(el).visibility!=='hidden'});
  function record(kind, el) {
    if (!running || !(el instanceof Element) || el===host || host.contains(el) || el.closest('#eps-pronote-bridge') || report.events.length>=80) return;
    if (el.matches('input[type=password],input[type=hidden]')) return;
    const chain=[]; let node=el;
    for(let i=0;node && i<6;i++,node=node.parentElement) chain.push(describe(node));
    const entry={kind,chain};const key=JSON.stringify(entry);
    if(seen.has(key))return;seen.add(key);report.events.push(entry);
    $('report').value=JSON.stringify(report,null,2);
    $('status').textContent=`Observation en cours : ${report.events.length} élément(s) technique(s). Ouvrez une case vide, puis téléchargez.`;
  }
  function scan(){pending=null;if(!running)return;document.querySelectorAll('input:not([type=password]):not([type=hidden]),textarea,[contenteditable=true],[role=textbox]').forEach(el=>{if(el.getClientRects().length)record('editor',el);});}
  function event(e){record(e.type,e.target);if(!pending)pending=setTimeout(scan,100);}
  function stop(){running=false;clearTimeout(timer);clearTimeout(pending);pending=null;observer?.disconnect();['focusin','click','dblclick'].forEach(t=>document.removeEventListener(t,event,true));$('report').value=JSON.stringify(report,null,2);$('status').textContent=`Diagnostic arrêté : ${report.events.length} élément(s). Vous pouvez télécharger le fichier et le joindre à la conversation.`;}
  function close(){stop();host.remove();}
  $('start').onclick=()=>{stop();report.events=[];seen=new Set();running=true;['focusin','click','dblclick'].forEach(t=>document.addEventListener(t,event,true));observer=new MutationObserver(records=>{if(records.some(r=>r.target!==host&&!host.contains(r.target))&&!pending)pending=setTimeout(scan,100);});observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','hidden','contenteditable']});timer=setTimeout(stop,60000);$('status').textContent='Observation active. Ouvrez maintenant une case vide sans écrire de note.';scan();};
  $('stop').onclick=stop;$('close').onclick=close;
  $('download').onclick=()=>{stop();const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='diagnostic-pronote.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  globalThis.EpsPronoteDiagnostic={close};
})();
