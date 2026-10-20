import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOfflineScheduleLoader,ScheduleUnavailableError,teachingWeekLabel,type ScheduleStorage} from '../lib/offline-schedule.ts';
import {parseSchedule,FERIT_URL,addDays,type Schedule} from '../lib/ferit.ts';

const key='3-53',week='2026-10-12';
const snapshot=()=>parseSchedule(readFileSync(new URL('./fixtures/3-53.html',import.meta.url),'utf8'),key,`${FERIT_URL}/${week}/${key}`);
const offline=async()=>{throw new TypeError('No connection');};
function storage(){
 const values=new Map<string,string>();
 const api:ScheduleStorage={get:async key=>values.get(key)??null,set:async(key,value)=>{values.set(key,value);},keys:async()=>[...values.keys()]};
 return {values,api};
}
function shifted(date:string,fetchedAt:string):Schedule{
 const original=snapshot();const offset=(Date.parse(date)-Date.parse(week))/86400000;
 return {...original,fetchedAt,sourceUrl:`${FERIT_URL}/${date}/${key}`,teachingWeek:'4. nastavni tj.',lessons:original.lessons.map(l=>({...l,date:addDays(l.date,offset)}))};
}

test('a downloaded week survives an app restart and is immediately displayed before an offline request finishes',async()=>{
 const s=storage();const original=snapshot();
 await createOfflineScheduleLoader(async()=>original,s.api).load(key,week);
 const seen:Schedule[]=[];const reopened=createOfflineScheduleLoader(offline,s.api);
 const result=await reopened.load(key,'2026-10-14',{onSaved:value=>seen.push(value.schedule)});
 assert.deepEqual(seen,[original]);assert.deepEqual(result.snapshot.schedule,original);assert.equal(result.offline,true);assert.equal(result.fallback,false);
 assert.equal(result.snapshot.week,week);
});

test('server errors, a maintenance response and the wrong teaching week cannot overwrite the saved timetable',async()=>{
 const s=storage();const original=snapshot();await createOfflineScheduleLoader(async()=>original,s.api).load(key,week);
 for(const read of [offline,async()=>({error:'maintenance'} as unknown as Schedule),async()=>shifted('2026-10-19',new Date().toISOString())]){
  const result=await createOfflineScheduleLoader(read,s.api).load(key,week);assert.equal(result.offline,true);assert.deepEqual(result.snapshot.schedule,original);
  assert.deepEqual(JSON.parse(s.values.get(`ferit-week:${key}:${week}`)!),original);
 }
});

test('a valid empty timetable replaces the old week and is still usable offline',async()=>{
 const s=storage();const empty={...snapshot(),lessons:[]};
 await createOfflineScheduleLoader(async()=>snapshot(),s.api).load(key,week);
 assert.equal((await createOfflineScheduleLoader(async()=>empty,s.api).load(key,week)).snapshot.schedule.lessons.length,0);
 assert.equal((await createOfflineScheduleLoader(offline,s.api).load(key,week)).snapshot.schedule.lessons.length,0);
});

test('a native widget refresh replaces stale in-memory data when the app resumes offline',async()=>{
 const s=storage();const original={...snapshot(),fetchedAt:'2026-10-20T08:00:00Z'};
 let online=true;
 const loader=createOfflineScheduleLoader(async()=>{if(!online)throw new Error('offline');return original;},s.api);
 await loader.load(key,week);
 const refreshed={...original,fetchedAt:'2026-10-20T09:00:00Z',lessons:original.lessons.map(l=>({...l,room:'NEW ROOM'}))};
 s.values.set(`ferit-week:${key}:${week}`,JSON.stringify(refreshed));online=false;
 const result=await loader.load(key,week);
 assert.equal(result.offline,true);assert.deepEqual(result.snapshot.schedule,refreshed);
 assert.deepEqual(JSON.parse(s.values.get(`ferit-week:${key}:${week}`)!),refreshed);
});

test('new online results replace the saved copy, while cache failures still keep data in memory',async()=>{
 const s=storage();let current=snapshot();const loader=createOfflineScheduleLoader(async()=>current,s.api);
 await loader.load(key,week);current={...current,fetchedAt:'2026-10-14T14:00:00Z',teachingWeek:'Updated',lessons:[]};await loader.load(key,week);
 assert.deepEqual((await createOfflineScheduleLoader(offline,s.api).load(key,week)).snapshot.schedule,current);
 let available=true;const broken=createOfflineScheduleLoader(async()=>{if(!available)throw new Error('offline');return current;},{get:async()=>{throw new Error('storage');},set:async()=>{throw new Error('storage');},keys:async()=>{throw new Error('storage');}});
 await broken.load(key,week);available=false;assert.deepEqual((await broken.load(key,week)).snapshot.schedule,current);
});

test('startup can open the last fetched week with its real dates; later date navigation never relabels it as the requested week',async()=>{
 const s=storage();const a={...snapshot(),fetchedAt:'2026-10-14T08:00:00Z'};const b=shifted('2026-10-19','2026-10-14T07:00:00Z');
 await createOfflineScheduleLoader(async()=>b,s.api).load(key,'2026-10-19');await createOfflineScheduleLoader(async()=>a,s.api).load(key,week);
 const loader=createOfflineScheduleLoader(offline,s.api);const result=await loader.load(key,'2026-10-28',{allowLastSaved:true});
 assert.equal(result.fallback,true);assert.equal(result.offline,true);assert.equal(result.snapshot.week,week);assert.deepEqual(result.snapshot.schedule,a);
 await assert.rejects(loader.load(key,'2026-10-28'),error=>error instanceof ScheduleUnavailableError&&error.lastSaved?.week===week);
});

test('corrupt records and another study are excluded from fallback, and existing WebView cache keys remain compatible',async()=>{
 const s=storage();s.values.set(`ferit-week:${key}:${week}`,JSON.stringify(snapshot()));s.values.set(`ferit-week:${key}:2026-10-19`,'bad JSON');s.values.set('ferit-week:1-65:2026-10-12',JSON.stringify(snapshot()));
 assert.equal((await createOfflineScheduleLoader(offline,s.api).load(key,week)).snapshot.schedule.teachingWeek,'3. nastavni tj.');
 await assert.rejects(createOfflineScheduleLoader(offline,s.api).load('1-65','2026-10-28',{allowLastSaved:true}),error=>error instanceof ScheduleUnavailableError&&error.lastSaved===null);
});

test('saved weeks do not expire or disappear after more than twenty downloads',async()=>{
 const s=storage();for(let i=0;i<24;i++){const date=addDays(week,i*7);const schedule=shifted(date,'2026-10-14T08:00:00Z');await createOfflineScheduleLoader(async()=>schedule,s.api).load(key,date);}
 assert.equal(s.values.size,24);const reopened=createOfflineScheduleLoader(offline,s.api);assert.equal((await reopened.load(key,week)).snapshot.week,week);
});

test('cancelled requests cannot replace a good cache or present fallback after switching schedules',async()=>{
 const s=storage();const original=snapshot();await createOfflineScheduleLoader(async()=>original,s.api).load(key,week);
 let resolve!:(value:Schedule)=>void;const controller=new AbortController();const loader=createOfflineScheduleLoader(()=>new Promise(done=>{resolve=done;}),s.api);
 const loading=loader.load(key,week,{signal:controller.signal});while(!resolve)await new Promise(done=>setImmediate(done));controller.abort();resolve({...original,lessons:[]});
 await assert.rejects(loading,{name:'AbortError'});assert.deepEqual(JSON.parse(s.values.get(`ferit-week:${key}:${week}`)!),original);
 const prior=new AbortController();prior.abort();let seen=false;await assert.rejects(loader.load(key,week,{signal:prior.signal,onSaved:()=>{seen=true;}}),{name:'AbortError'});assert.equal(seen,false);
});

test('the label uses FERIT teaching-week text and preserves official holiday or exam labels',()=>{
 assert.equal(teachingWeekLabel(' 3. nastavni tj. '),'3. nastavni tjedan');assert.equal(teachingWeekLabel('12. nastavni tjedan'),'12. nastavni tjedan');
 assert.equal(teachingWeekLabel('Zimski ispitni rok'),'Zimski ispitni rok');assert.equal(teachingWeekLabel(''),'');
});
