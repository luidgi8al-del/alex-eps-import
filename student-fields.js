function studentExtraColumns(headers, fields) {
  const normalized=headers.map(v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/[_-]/g,' '));
  const get=names=>{const i=normalized.findIndex(h=>names.includes(h));return i<0?'':String(fields[i]||'').trim()};
  const date=get(['date de naissance','date naissance','naissance','ddn','birth date']);
  let birth=null;
  if(date){
    const fr=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date),iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const y=Number(fr?.[3]||iso?.[1]),m=Number(fr?.[2]||iso?.[2]),d=Number(fr?.[1]||iso?.[3]);
    const value=new Date(Date.UTC(y,m-1,d));
    if(!fr&&!iso || value.getUTCFullYear()!==y || value.getUTCMonth()!==m-1 || value.getUTCDate()!==d) throw new Error('Date de naissance invalide : '+date);
    birth=value.getTime();
  }
  return {birth_date_epoch_millis:birth,parent_phone:get(['telephone parent','telephone parents','tel parent','tel parents','parent phone'])||null,
    parent1_email:get(['email parent 1','mail parent 1','email responsable 1','mail responsable 1'])||null,
    parent2_email:get(['email parent 2','mail parent 2','email responsable 2','mail responsable 2'])||null};
}
