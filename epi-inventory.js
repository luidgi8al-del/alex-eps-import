let epiFamily = null;
let epiActiveView = true;
let epiPreparing = false;
const EPI_STATE_LABELS={green:'Conforme',orange:'À vérifier',red:'À retirer du service'};

function resetEpiInventory(){epiList=[];epiInspections=[];epiOpenedId=null;epiFamily=null;epiActiveView=true;epiSearch='';}

function renderEpiInventory() {
  const host=document.getElementById('equipTab-epi'),M=EpsEpiInventory;
  const categories=[...M.families,...EPI_CATEGORIES.filter(([key])=>!M.families.some(f=>f.key===key)&&epiList.some(i=>i.category===key)).map(([key,label])=>({key,label,single:label,target:0}))];
  const family=categories.find(f=>f.key===epiFamily);
  if(!family){
    host.innerHTML=`<section class="card epi-inventory"><div class="top"><div><h2>EPI escalade</h2><p class="muted">Choisissez une famille pour retrouver ses fiches individuelles.</p></div><button type="button" id="epiPrepare" ${epiPreparing?'disabled':''}>${epiPreparing?'Préparation…':'Préparer les fiches'}</button></div><div class="epi-families">${categories.map(f=>{
      const active=M.rows(epiList,f.key,true),inactive=M.rows(epiList,f.key,false),red=active.filter(i=>M.state(i)==='red').length,orange=active.filter(i=>M.state(i)==='orange').length;
      return `<button type="button" class="secondary epi-family" data-epi-family="${equipmentText(f.key)}"><strong>${equipmentText(f.label)}</strong><span>${active.length} actifs · ${inactive.length} inactifs</span><small>${red?`${red} à retirer · `:''}${orange?`${orange} à vérifier`:active.length?'Tous conformes':f.target?`${f.target} fiches prévues`:'Nombre de fiches libre'}</small></button>`;
    }).join('')}</div><div class="epi-toolbar"><button type="button" class="secondary" id="epiAllLabels" ${epiList.length?'':'disabled'}>Télécharger toutes les étiquettes</button><button type="button" class="secondary" id="addEpiBtn">＋ Ajouter un EPI</button></div><p class="muted">La préparation complète jusqu’à 20 baudriers, 30 cordes, 20 descendeurs, 20 mousquetons et 30 casques, sans modifier les fiches existantes. Les nouvelles fiches sont inactives.</p><div id="epiInventoryMessage" role="status"></div></section>`;
    document.getElementById('epiPrepare').onclick=prepareEpiInventory;
    document.getElementById('epiAllLabels').onclick=()=>downloadEpiLabels(epiList);
    document.getElementById('addEpiBtn').onclick=addEpiItem;
    host.querySelectorAll('[data-epi-family]').forEach(b=>b.onclick=()=>{epiFamily=b.dataset.epiFamily;epiActiveView=true;renderEpi();});return;
  }
  const active=M.rows(epiList,family.key,true),inactive=M.rows(epiList,family.key,false);
  const visible=(epiActiveView?active:inactive).filter(i=>!epiSearch||[i.internal_id,i.manufacturer,i.model,i.location].some(v=>String(v||'').toLowerCase().includes(epiSearch.toLowerCase())));
  host.innerHTML=`<section class="card epi-inventory"><div class="epi-toolbar"><button class="secondary" type="button" id="epiBackFamilies">← EPI escalade</button></div><div class="epi-grid-heading"><h2>${equipmentText(family.label)}</h2><div class="epi-switch" aria-label="Activation des fiches"><button type="button" data-epi-active="true" aria-pressed="${epiActiveView}" class="${epiActiveView?'':'secondary'}">Actifs (${active.length})</button><button type="button" data-epi-active="false" aria-pressed="${!epiActiveView}" class="${epiActiveView?'secondary':''}">Inactifs (${inactive.length})</button></div></div><div class="epi-legend"><span class="epi-green">● Conforme</span><span class="epi-orange">● À vérifier / échéance proche</span><span class="epi-red">● À retirer du service</span></div><label for="epiSearchInput">Rechercher dans cette famille</label><input id="epiSearchInput" value="${equipmentText(epiSearch)}" placeholder="Numéro, modèle ou rangement"><div class="epi-item-grid">${visible.map(i=>{
    const state=epiActiveView?M.state(i):'inactive';return `<button type="button" class="epi-item epi-${state}" data-open-epi="${equipmentText(i.id)}"><strong>${equipmentText(i.internal_id||family.single)}</strong><span>● ${epiActiveView?EPI_STATE_LABELS[state]:'Non activée'}</span></button>`;
  }).join('')}</div>${!visible.length?`<p class="muted">${epiActiveView?'Aucune fiche active. Ouvrez Inactifs pour compléter et activer vos fiches.':'Aucune fiche inactive.'}</p>`:''}<div class="epi-toolbar"><button type="button" class="secondary" id="epiFamilyLabels" ${active.length+inactive.length?'':'disabled'}>Télécharger les étiquettes de cette famille</button><button type="button" class="secondary" id="addEpiBtn">＋ Ajouter un EPI</button></div><p class="muted">Actif = fiche activée. Un équipement rouge reste à retirer du service. Une fiche sans contrôle renseigné reste orange.</p></section>`;
  document.getElementById('epiBackFamilies').onclick=()=>{epiFamily=null;epiSearch='';renderEpi();};
  document.getElementById('addEpiBtn').onclick=addEpiItem;
  document.getElementById('epiFamilyLabels').onclick=()=>downloadEpiLabels([...active,...inactive]);
  host.querySelectorAll('[data-epi-active]').forEach(b=>b.onclick=()=>{epiActiveView=b.dataset.epiActive==='true';epiSearch='';renderEpi();});
  host.querySelectorAll('[data-open-epi]').forEach(b=>b.onclick=()=>{epiOpenedId=b.dataset.openEpi;renderEpi();});
  document.getElementById('epiSearchInput').oninput=e=>{epiSearch=e.target.value;renderEpi();const input=document.getElementById('epiSearchInput');input.focus();input.setSelectionRange(epiSearch.length,epiSearch.length);};
}

async function prepareEpiInventory(){
  if(epiPreparing)return;const owner=session?.user_id;if(!owner)return;
  epiPreparing=true;renderEpiInventory();
  try{
    const response=await apiFetch(`${SUPABASE_URL}/rest/v1/rpc/eps_prepare_epi_inventory`,{method:'POST',body:'{}'});
    if(!response.ok)throw Error('Préparation indisponible : la mise à jour SQL EPI doit être installée dans Supabase et une connexion Internet est nécessaire.');
    const created=await response.json();if(session?.user_id!==owner)return;
    await loadEpiItems();if(session?.user_id!==owner)return;
    const message=document.getElementById('epiInventoryMessage');if(message)message.textContent=`${created} fiche(s) créée(s). Les fiches et leurs QR codes sont disponibles dans Inactifs.`;
  }catch(error){if(session?.user_id===owner){const message=document.getElementById('epiInventoryMessage');if(message){message.className='error';message.textContent=error.message;}}}
  finally{epiPreparing=false;const button=document.getElementById('epiPrepare');if(button){button.disabled=false;button.textContent='Préparer les fiches';}}
}

function epiQrSvg(item){
  const temp=document.createElement('div');const qr=new QRCode(temp,{text:EpsEpiInventory.link(item.id),width:256,height:256,correctLevel:QRCode.CorrectLevel.M});
  const matrix=qr._oQRCode,n=matrix.getModuleCount(),size=n+8;let path='';
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(matrix.isDark(y,x))path+=`M${x+4} ${y+4}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code ${equipmentText(item.internal_id)}"><rect width="${size}" height="${size}" fill="white"/><path d="${path}" fill="black"/></svg>`;
}
function epiDownload(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function epiLabelHtml(items){return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Étiquettes EPI EPS LVH</title><style>@page{size:A4;margin:10mm}body{font-family:Arial;color:#000}.labels{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}.label{break-inside:avoid;border:1px solid #bbb;text-align:center;padding:3mm}svg{width:38mm;height:38mm;display:block;margin:auto}b{font-size:16px}small{display:block;font-size:10px}h1,button{font-size:16px}@media print{h1,button{display:none}}</style><h1>EPS LVH · Étiquettes matériel</h1><button onclick="window.print()">Imprimer / enregistrer en PDF</button><div class="labels">${items.filter(i=>!i.deleted).map(i=>`<div class="label">${epiQrSvg(i)}<b>${equipmentText(i.internal_id)}</b><small>EPS LVH · ${equipmentText((EPI_CATEGORIES.find(c=>c[0]===i.category)||['','EPI'])[1])}</small></div>`).join('')}</div></html>`;}
function downloadEpiLabels(items){try{epiDownload(new Blob([epiLabelHtml(items)],{type:'text/html;charset=utf-8'}),'EPS-LVH-etiquettes-EPI.html');}catch{alert('Impossible de générer les étiquettes. Réouvrez la fiche et réessayez.');}}

function showEpiQr(item){
  const host=document.getElementById('epiQrCanvas');if(!host)return;
  try{host.innerHTML=epiQrSvg(item);}catch{host.textContent='Générateur QR indisponible. Rechargez l’application.';return;}
  const safe=String(item.internal_id||'EPI').replace(/[^a-zA-Z0-9_-]/g,'-');
  document.getElementById('saveEpiLabelBtn').onclick=async()=>{
    const image=new Image(),url=URL.createObjectURL(new Blob([epiQrSvg(item)],{type:'image/svg+xml'}));
    try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});const canvas=document.createElement('canvas');canvas.width=640;canvas.height=720;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,640,720);ctx.drawImage(image,0,0,640,640);ctx.fillStyle='black';ctx.textAlign='center';ctx.font='bold 28px Arial';ctx.fillText(String(item.internal_id||'EPI'),320,680,610);canvas.toBlob(blob=>{if(blob)epiDownload(blob,`${safe}-QR.png`);},'image/png');}finally{URL.revokeObjectURL(url);}
  };
  document.getElementById('printEpiLabelBtn').onclick=()=>{const popup=window.open('','_blank');if(!popup)return;popup.document.write(epiLabelHtml([item]));popup.document.close();};
}

async function openEpiLinkFromLocation(){
  const id=new URLSearchParams(location.search).get('epi');if(!id||!session?.user_id)return false;
  try{EpsEpiInventory.link(id);}catch{return false;}
  const owner=session.user_id;showTab('equipement',{skipModuleStart:true});
  try{return await openEquipmentSearchResult('epi',id,{isCurrent:()=>session?.user_id===owner});}
  catch(error){if(session?.user_id===owner){document.getElementById('equipTab-epi').innerHTML=`<section class="card"><h2>Fiche EPI indisponible</h2><p>${equipmentText(error.message||'Cette fiche est inaccessible pour ce compte ou absente de la copie hors ligne.')}</p><button type="button" id="epiLinkRetry">Réessayer</button></section>`;document.getElementById('epiLinkRetry').onclick=openEpiLinkFromLocation;}return false;}
}
