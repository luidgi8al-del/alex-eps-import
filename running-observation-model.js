/* Observation feedback is separate from the classic running performance grade. Durations are seconds. */
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
 function config(p){return {distance:+p.distance===250?250:500,count:Math.max(1,Math.min(10,Math.trunc(+p.count||3))),difficulty:Math.max(-30,Math.min(30,Math.trunc(+p.difficulty||0)))}}
 function setObserver(pupil,id,count=3){const next=structuredClone(pupil||{runs:[]});next.runs??=[];for(let i=0;i<Math.max(count,next.runs.length);i++){const r=next.runs[i]??={};if((r.observerId||'')!==id){r.observerId=id;r.validated=false}}return next}
 function extendRuns(pupil,count){const next=structuredClone(pupil||{runs:[]});next.runs??=[];const observerId=next.runs[0]?.observerId||'';while(next.runs.length<count)next.runs.push(observerId?{observerId}:{});return next}
 function summary(pupil,p,sex,rules){const {distance,count,difficulty}=config(p),runs=Array.from({length:count},(_,i)=>pupil?.runs?.[i]||{}),done=runs.filter(complete).length,walking=!!pupil?.walking,scale=count>1?12:walking?3:6;if(done<count)return {done,count,scale,total:null};const times=runs.map(r=>Math.round(r.total)),avg=times.reduce((a,b)=>a+b,0)/count,perf=walking?rules.walking(avg,distance,difficulty):rules.performance(avg,sex,distance,difficulty),gap=times.slice(1).reduce((sum,t,i)=>sum+Math.abs(t-times[i]),0),reg=count>1?rules.regularity(gap)*(walking?1.5:1):0;return {done,count,scale,avg,perf,reg,total:perf==null?null:Math.round((perf+reg)*100)/100}}
 const api={labels,advice,complete,analyse,coherent,passage,format,config,setObserver,extendRuns,summary};root.EpsRunningObservation=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
