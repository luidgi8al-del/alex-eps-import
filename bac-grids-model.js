/* Pure, versioned AFL1 scoring. Empty is never zero; no national/rubric fallback. */
(function(root){
 'use strict';
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 const round=n=>Math.round((n+Number.EPSILON)*100)/100;
 function base(spec,v,i){
  const c=spec?.criteria?.[i],d=v?.degrees?.[i],n=v?.notes?.[i];
  if(!c||!Number.isInteger(d)||d<0||d>3||!finite(n))return null;
  if(c.choices){const index=v?.choices?.[i],option=Number.isInteger(index)?c.choices[d]?.[index]:null;return option&&option.value===n?n:null}
  const [lo,hi]=c.degrees[d].range;return n>=lo&&n<=hi?n:null;
 }
 function result(spec,v,i){
  let n=base(spec,v,i);if(n==null)return null;
  const c=spec.criteria[i],d=v.degrees[i],p=v.params||{};let detail=String(n);
  if(c.adjust==='volley'){
   if(!['loss','win'].includes(p.outcome))return null;
   const k=(p.outcome==='loss'?[1,.85,.9,.92]:[1.32,1.15,1.08,1])[d];detail+=` × ${k}`;n*=k;
  }else if(c.adjust==='gym'){
   if(!['0.9','1','1.1'].includes(p.difficulty))return null;
   n*=Number(p.difficulty);detail+=` × ${p.difficulty}`;
   if(p.round==='yes'){n=Math.round(n);detail+=' · arrondi à l’entier'}
  }else if(c.adjust==='acro'){
   const weights={A:.1,B:.15,C:.2,D:.25},figures=[0,1,2,3].map(j=>weights[p['figure'+j]]);
   if(figures.some(x=>x==null)||!/^([0-9]|1[0-6])$/.test(p.missing??''))return null;
   const k=round(figures.reduce((a,b)=>a+b,0)),penalty=Number(p.missing)*.5;detail+=` × ${k} − ${penalty}`;n=n*k-penalty;
  }
  n=round(Math.min(c.max,Math.max(0,n)));return{score:n,detail:detail+' = '+n+' /'+c.max};
 }
 function total(spec,v){if(!spec||!v)return null;const ns=spec.criteria.map((_,i)=>result(spec,v,i)?.score);return ns.some(n=>n==null)?null:round(ns.reduce((a,b)=>a+b,0))}
 function setNote(v,i,d,n,choice=null){const next=structuredClone(v||{});next.degrees??=[];next.notes??=[];next.choices??=[];next.degrees[i]=d;next.notes[i]=n;next.choices[i]=choice;return next}
 const api={base,result,total,setNote};root.EpsBacGridsModel=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
