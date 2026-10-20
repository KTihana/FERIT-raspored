import {addDays,monday,ScheduleInPreparationError,type Schedule} from './ferit.ts';

export type UpcomingWeek={week:string;schedule:Schedule;offline:boolean};
export type UpcomingSnapshot={from:string;through:string;weeks:UpcomingWeek[];unavailable:string[];inPreparation:string[];completed:number;total:number};
export type UpcomingReader=(key:string,week:string,signal?:AbortSignal)=>Promise<{schedule:Schedule;offline:boolean}>;

/** Fetch a bounded, explicit date range. A missing week is never treated as an empty week. */
export async function readUpcomingWeeks(key:string|string[],today:string,read:UpcomingReader,options:{signal?:AbortSignal;onProgress?:(snapshot:UpcomingSnapshot)=>void;weekCount?:number}={}):Promise<UpcomingSnapshot>{
 const {signal,onProgress}=options;signal?.throwIfAborted();
 const count=Math.max(1,Math.min(24,Math.trunc(options.weekCount??16)));
 const keys=[...new Set(typeof key==='string'?[key]:key)];
 const from=monday(today),through=addDays(from,count*7-1);
 const requests=Array.from({length:count},(_,i)=>keys.map(key=>({key,week:addDays(from,i*7)}))).flat();
 const total=requests.length;
 const weeks:UpcomingWeek[]=[],unavailable:string[]=[],inPreparation:string[]=[];let next=0,completed=0;
 const snapshot=():UpcomingSnapshot=>({from,through,weeks:[...weeks].sort((a,b)=>a.week.localeCompare(b.week)),unavailable:[...unavailable].sort(),inPreparation:[...inPreparation].sort(),completed,total});
 async function worker(){
  while(next<total){
   signal?.throwIfAborted();const {key,week}=requests[next++];
   try{
    const result=await read(key,week,signal);signal?.throwIfAborted();
    if(result.schedule.lessons.some(l=>l.scheduleKey!==key||monday(l.date)!==week))throw new Error('FERIT je vratio drugi raspored.');
    weeks.push({week,...result});
   }catch(error){signal?.throwIfAborted();if(error instanceof Error&&error.name==='AbortError')throw error;(error instanceof ScheduleInPreparationError?inPreparation:unavailable).push(week);}
   completed++;onProgress?.(snapshot());
  }
 }
 await Promise.all(Array.from({length:Math.min(3,total)},()=>worker()));signal?.throwIfAborted();return snapshot();
}

export function assessmentWeekRange(week:string):string{
 const label=(date:string)=>{const [year,month,day]=date.split('-');return `${Number(day)}. ${Number(month)}. ${year}.`;};
 return `${label(week)} – ${label(addDays(week,6))}`;
}

export function assessmentCountdown(date:string,today:string):string{
 const days=Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
 return days===0?'Danas':days===1?'Sutra':`Za ${days} dana`;
}
