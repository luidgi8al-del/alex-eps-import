/* AFL1 only. Values are grades, never safety authorisations. Shared with BacClimbModel.kt. */
(function(root){
 'use strict';
 const routes=['4a','4b','4c','5a','5b','5c','6a'],bases=[.75,2.25,3.75,5.25];
 function note(value,index,manual=false){
  const d=value?.degrees?.[index];if(!Number.isInteger(d)||d<0||d>3)return null;
  if(manual){const n=value?.manualNotes?.[index];return typeof n==='number'&&Number.isFinite(n)&&n>=1.5*d&&n<=1.5*(d+1)?n:null}
  const r=routes.indexOf(value?.route);if(r<0)return null;
  return bases[d]+(r-3)*.25*(d<2?-1:1);
 }
 function total(value,manual){const a=note(value,0,manual),b=note(value,1,manual);return a==null||b==null?null:Math.round((a+b)*100)/100}
 function setDegree(value,index,degree,manual){const v=structuredClone(value||{route:'',degrees:[null,null],manualNotes:[null,null]});v.degrees??=[null,null];v.manualNotes??=[null,null];if(v.degrees[index]!==degree)v.manualNotes[index]=bases[degree];v.degrees[index]=degree;return v}
 root.EpsBacClimbModel={routes,bases,note,total,setDegree};
 if(typeof module==='object'&&module.exports)module.exports=root.EpsBacClimbModel;
})(globalThis);
