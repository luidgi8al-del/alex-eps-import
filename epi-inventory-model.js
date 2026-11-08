(function(root) {
  const families = [
    {key:'BAUDRIER',label:'Baudriers',single:'Baudrier',prefix:'BAU',target:20},
    {key:'CORDE',label:'Cordes',single:'Corde',prefix:'COR',target:0},
    {key:'SYSTEME_ASSURAGE',label:'Descendeurs',single:'Descendeur',prefix:'ASS',target:20},
    {key:'MOUSQUETON',label:'Mousquetons',single:'Mousqueton',prefix:'MOU',target:20},
    {key:'CASQUE',label:'Casques',single:'Casque',prefix:'CAS',target:30}
  ];
  const base='https://luidgi8al-del.github.io/alex-eps-import/';
  function link(id) {
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(String(id || ''))) throw Error('Identifiant EPI invalide.');
    return base+'?epi='+encodeURIComponent(id)+'#equipement';
  }
  function idFromLink(value) {
    try { const url=new URL(value); const expected=new URL(base);
      if(url.origin!==expected.origin || ![expected.pathname,expected.pathname+'index.html'].includes(url.pathname))return null;
      const id=url.searchParams.get('epi'); return id&&/^[A-Za-z0-9_-]{1,180}$/.test(id)?id:null;
    } catch{return null;}
  }
  function active(item){ return item.active !== false; }
  function state(item,now=Date.now()) {
    if(['QUARANTAINE','REFORME'].includes(item.status))return 'red';
    const end=Number(item.end_of_life_date_epoch_millis || 0);
    if(end && end<=now)return 'red';
    const next=Number(item.next_inspection_date_epoch_millis || 0);
    if(item.status!=='EN_SERVICE' || String(item.comment || '').trim() || !item.last_inspection_date_epoch_millis || !next || next<=now+30*86400000)return 'orange';
    return 'green';
  }
  function rows(items,category,isActive=true){return items.filter(i=>!i.deleted&&(!category||i.category===category)&&active(i)===isActive);}
  const api={families,link,idFromLink,active,state,rows};root.EpsEpiInventory=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
