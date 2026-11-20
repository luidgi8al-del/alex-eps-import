/* Bilan pédagogique /20. Session marks remain /12; adjustments are points /20. */
(function(root){
  const round=n=>Math.round((n+Number.EPSILON)*100)/100, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const regularity=g=>g<=2?6:g<=4?5.7:g<=6?5.4:g<=8?5.1:g<=10?4.8:g===11?4.5:g>25?0:Math.max(0,4.2-(g-12)*.3);
  function entry(row,saved){
    if(!row||row.deleted||saved.deleted)return null;
    const text=String(row.input_unit||''),match=/^runs:500:3:/.test(text);
    if(!match)return null;
    const date=Number(saved.created_at)||Date.parse(saved.created_at),raw=text.split(':times:')[1]?.split('|');
    const difficulty=Number(text.match(/:difficulty:([^:]+)/)?.[1]||0),walk=text.includes(':mode:walk:');
    if(!Number.isFinite(date)||!raw||raw.length!==3||!Number.isInteger(difficulty)||Math.abs(difficulty)>30)return null;
    const seconds=v=>/^\d{1,3}$/.test(v)&&+v>0&&+v%100<60?Math.floor(+v/100)*60+(+v%100):null;
    const invalid=raw.some(v=>v!==''&&v!=='__REMOVED__'&&seconds(v)===null),times=raw.map(seconds),done=times.filter(v=>v!==null).length;
    const base={id:String(saved.id),date,done,signature:`${difficulty}:${walk?'walk':'run'}`};
    if(invalid)return {...base,status:'invalid'};
    if(!done)return {...base,status:'absent'};
    if(done<3)return {...base,status:'incomplete'};
    const score=Number(row.result_value),unit=String(row.result_unit||'').trim();
    if(row.result_value==null||row.result_value===''||unit!=='/12'||!Number.isFinite(score)||score<0||score>12)return {...base,status:'invalid'};
    const gap=Math.abs(times[1]-times[0])+Math.abs(times[2]-times[1]),reg=regularity(gap)*(walk?1.5:1),perf=score-reg;
    if(perf<-.02||perf>(walk?3:6)+.02)return {...base,status:'invalid'};
    return {...base,status:'complete',score,reg:round(reg),perf:round(clamp(perf,0,walk?3:6)),average:times.reduce((a,b)=>a+b,0)/3,gap};
  }
  function calculate(entries,settings={}){
    const {mode='progress',performanceCap=1,regularityCap=1,penalty=.5,penaltyCap=2,justified=[]}=settings;
    const samples=entries.filter(e=>e?.status==='complete').sort((a,b)=>a.date-b.date||a.id.localeCompare(b.id));
    const incomplete=entries.filter(e=>e?.status==='incomplete'),exempt=new Set(justified.map(String));
    const charged=incomplete.filter(e=>!exempt.has(e.id)),incompatible=new Set(samples.map(e=>e.signature)).size>1;
    const result={count:samples.length,incomplete:incomplete.length,charged:charged.length,justified:incomplete.length-charged.length,invalid:entries.filter(e=>e?.status==='invalid').length,absent:entries.filter(e=>e?.status==='absent').length,incompatible,mean:null,base:null,performanceAdjustment:0,regularityAdjustment:0,penalty:0,score:null,chronoDelta:null,gapDelta:null};
    if(!samples.length)return result;
    const mean=samples.reduce((s,e)=>s+e.score,0)/samples.length*20/12;
    const weighted=samples.reduce((s,e,i)=>s+e.score*(i>=samples.length-2?2:1),0)/samples.reduce((s,e,i)=>s+(i>=samples.length-2?2:1),0)*20/12;
    const average=(rows,key)=>rows.reduce((s,e)=>s+e[key],0)/rows.length;
    if(samples.length>1&&!incompatible){
      const n=samples.length>=4?2:1,first=samples.slice(0,n),last=samples.slice(-n);
      result.chronoDelta=round(average(first,'average')-average(last,'average'));
      result.gapDelta=round(average(first,'gap')-average(last,'gap'));
      if(mode==='progress'){
        const pc=clamp(Number(performanceCap)||0,0,20),rc=clamp(Number(regularityCap)||0,0,20);
        result.performanceAdjustment=round(clamp((average(last,'perf')-average(first,'perf'))*20/12,-pc,pc));
        result.regularityAdjustment=round(clamp((average(last,'reg')-average(first,'reg'))*20/12,-rc,rc));
      }
    }
    result.mean=round(mean);result.base=round(mode==='recent'?weighted:mean);
    result.penalty=round(Math.min(charged.length*clamp(Number(penalty)||0,0,20),clamp(Number(penaltyCap)||0,0,20)));
    result.score=round(clamp((mode==='recent'?weighted:mean)+result.performanceAdjustment+result.regularityAdjustment-result.penalty,0,20));
    return result;
  }
  const api={entry,calculate,regularity};root.RunningBilan=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
