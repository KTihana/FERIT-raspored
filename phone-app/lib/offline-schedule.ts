import {FERIT_URL,ScheduleInPreparationError,monday,minutes,type Schedule} from './ferit.ts';

export type ScheduleStorage={get:(key:string)=>Promise<string|null>;set:(key:string,value:string)=>Promise<void>;keys:()=>Promise<string[]>};
export type SavedWeek={key:string;week:string;schedule:Schedule};
type ScheduleReader=(key:string,date:string,signal?:AbortSignal)=>Promise<Schedule>;
const prefix='ferit-week:';
const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);

function validSchedule(value:unknown,key:string,week:string):value is Schedule{
 if(!record(value)||!Array.isArray(value.lessons)||typeof value.fetchedAt!=='string'||!Number.isFinite(Date.parse(value.fetchedAt))||typeof value.teachingWeek!=='string'||value.sourceUrl!==`${FERIT_URL}/${week}/${key}`)return false;
 return value.lessons.every(l=>record(l)&&l.scheduleKey===key&&typeof l.date==='string'&&validDate(l.date)&&monday(l.date)===week&&['id','title','room','type','typeLabel','teacher','group','progress','courseCode','start','end'].every(field=>typeof l[field]==='string')&&/^([01]\d|2[0-3]):[0-5]\d$/.test(l.start as string)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(l.end as string)&&minutes(l.end as string)>minutes(l.start as string));
}

export function teachingWeekLabel(label:string){
 const cleaned=label.replace(/\s+/g,' ').trim();
 const number=cleaned.match(/^(\d+)\.\s*nastavni\s*(?:tj\.?|tjedan)\.?$/i)?.[1];
 return number?`${number}. nastavni tjedan`:cleaned;
}

export class ScheduleUnavailableError extends Error{
 readonly lastSaved:SavedWeek|null;
 constructor(lastSaved:SavedWeek|null){super('FERIT trenutno nije dostupan. Za odabrani tjedan nema spremljenog rasporeda.');this.name='ScheduleUnavailableError';this.lastSaved=lastSaved;}
}

export function createOfflineScheduleLoader(readSchedule:ScheduleReader,storage:ScheduleStorage){
 const memory=new Map<string,Schedule>();
 const cacheKey=(key:string,week:string)=>`${prefix}${key}:${week}`;
 async function save(key:string,week:string,schedule:Schedule){
  memory.set(cacheKey(key,week),schedule);
  // Keep the last successful data even if the device cannot write storage.
  try{await storage.set(cacheKey(key,week),JSON.stringify(schedule));}catch{}
 }
 async function saved(key:string,week:string):Promise<SavedWeek|null>{
  const id=cacheKey(key,week);let schedule:unknown;
  // The Android home widget can refresh this native cache while the app is closed.
  // Always compare the persisted copy with memory before reusing or writing it.
  try{schedule=JSON.parse(await storage.get(id)??'null');}catch{}
  if(!validSchedule(schedule,key,week))schedule=memory.get(id);
  if(!validSchedule(schedule,key,week))return null;
  const current=memory.get(id);
  const chosen=current&&Date.parse(current.fetchedAt)>Date.parse(schedule.fetchedAt)?current:schedule;
  memory.set(id,chosen);
  return {key,week,schedule:chosen};
 }
 async function latest(key:string):Promise<SavedWeek|null>{
  let keys:string[]=[];try{keys=await storage.keys();}catch{}
  const ids=[...new Set([...keys,...memory.keys()])].filter(id=>id.startsWith(`${prefix}${key}:`));
  const results=await Promise.all(ids.map(async id=>{
   const week=id.slice(`${prefix}${key}:`.length);
   return validDate(week)&&monday(week)===week?saved(key,week):null;
  }));
  return results.filter((value):value is SavedWeek=>value!==null).sort((a,b)=>Date.parse(b.schedule.fetchedAt)-Date.parse(a.schedule.fetchedAt))[0]??null;
 }
 return {
  async load(key:string,date:string,options:{signal?:AbortSignal;onSaved?:(value:SavedWeek)=>void;allowLastSaved?:boolean}={}){
   if(!/^\d+-\d+$/.test(key)||!validDate(date))throw new Error('Neispravan datum ili studij.');
   const week=monday(date);const {signal}=options;signal?.throwIfAborted();
   const cached=await saved(key,week);signal?.throwIfAborted();
   if(cached){options.onSaved?.(cached);await save(key,week,cached.schedule);signal?.throwIfAborted();}
   try{
    const schedule=await readSchedule(key,week,signal);signal?.throwIfAborted();
    if(!validSchedule(schedule,key,week))throw new Error('FERIT je vratio neočekivani raspored.');
    await save(key,week,schedule);signal?.throwIfAborted();
    return {snapshot:{key,week,schedule},offline:false,fallback:false};
   }catch(error){
    signal?.throwIfAborted();if(error instanceof Error&&error.name==='AbortError')throw error;
    // A published "in preparation" notice is a source status, not an offline failure.
    if(error instanceof ScheduleInPreparationError)throw error;
    if(cached)return {snapshot:cached,offline:true,fallback:false};
    const lastSaved=await latest(key);signal?.throwIfAborted();
    if(options.allowLastSaved&&lastSaved)return {snapshot:lastSaved,offline:true,fallback:true};
    throw new ScheduleUnavailableError(lastSaved);
   }
  },
 };
}
