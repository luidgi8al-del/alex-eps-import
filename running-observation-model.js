/* Observation is feedback, not a BAC grade. All durations are seconds. */
(function(root){
 'use strict';
 const labels={steady:'Constant',faster:'A accéléré',slower:'A ralenti'};
 const advice={steady:'Conserver cette allure',faster:'Partir un peu plus vite',slower:'Partir moins vite'};
 const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
 const complete=r=>!!r&&positive(r.first)&&positive(r.total)&&r.total>r.first;
 function analyse(r,tolerance=2){if(!complete(r))return null;const delta=r.total-2*r.first;return Math.abs(delta)<=Math.max(0,Number(tolerance)||0)+1e-9?'steady':delta>0?'slower':'faster'}
 function coherent(r,tolerance=2){const actual=analyse(r,tolerance);return !!(actual&&r.validated&&r.observerId&&r.analysis===actual&&r.advice===actual)}
 function passage(r,seconds){if(!positive(seconds)||r?.total!=null)return r;const next={...r,validated:false};if(r?.first==null)next.first=seconds;else if(seconds-r.first>=.75)next.total=seconds;return next}
 function format(seconds){if(!positive(seconds))return '—';const tenths=Math.round(seconds*10);return `${Math.floor(tenths/600)}:${String(Math.floor(tenths%600/10)).padStart(2,'0')},${tenths%10}`}
 const api={labels,advice,complete,analyse,coherent,passage,format};root.EpsRunningObservation=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
