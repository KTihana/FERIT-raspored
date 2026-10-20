import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FERIT_URL,parseSchedule,ScheduleInPreparationError,type Schedule} from '../lib/ferit.ts';
import {createDirectFeritClient} from '../lib/direct-ferit.ts';
import {createOfflineScheduleLoader,type ScheduleStorage} from '../lib/offline-schedule.ts';
import {readUpcomingWeeks,assessmentWeekRange,type UpcomingSnapshot} from '../lib/upcoming-assessments.ts';

const pending=readFileSync(new URL('./fixtures/3-53-2027-01-25.html',import.meta.url),'utf8');
const key='3-53',week='2027-01-25';
const source=`${FERIT_URL}/${week}/${key}`;
const empty=(date:string):Schedule=>parseSchedule(`<div id="raspored"><div class="dan"><div class="naziv-dan">${date.slice(8)}.${date.slice(5,7)}.${date.slice(0,4)}.</div></div></div>`,key,`${FERIT_URL}/${date}/${key}`);

test('FERIT’s actual in-preparation page has a distinct status, not an empty timetable or format failure',()=>{
 assert.throws(()=>parseSchedule(pending,key,source),error=>error instanceof ScheduleInPreparationError&&error.code==='SCHEDULE_IN_PREPARATION');
 assert.throws(()=>parseSchedule('<div id="raspored">Maintenance</div>',key,source),error=>error instanceof Error&&!(error instanceof ScheduleInPreparationError));
 assert.throws(()=>parseSchedule(pending,'1-53',source),/drugi raspored/);
 assert.equal(empty(week).lessons.length,0);
 const published=pending.replace('</div>\n','<div class="dan"><div class="naziv-dan">25.01.2027.</div></div></div>');
 assert.equal(parseSchedule(published,key,source).lessons.length,0);
});

test('the source status reaches the list through native transport and offline storage, including an older cached week',async()=>{
 const client=createDirectFeritClient(async()=>pending);
 const values=new Map<string,string>();
 const storage:ScheduleStorage={get:async key=>values.get(key)??null,set:async(key,value)=>{values.set(key,value);},keys:async()=>[...values.keys()]};
 const loader=createOfflineScheduleLoader(client.freshSchedule,storage);
 await assert.rejects(loader.load(key,week),ScheduleInPreparationError);
 const prior=empty(week);
 values.set(`ferit-week:${key}:${week}`,JSON.stringify(prior));
 await assert.rejects(loader.load(key,week),ScheduleInPreparationError);
 assert.deepEqual(JSON.parse(values.get(`ferit-week:${key}:${week}`)!),prior);
 const result=await readUpcomingWeeks(key,week,async(key,date)=>{
  const result=await loader.load(key,date);
  return {schedule:result.snapshot.schedule,offline:result.offline};
 },{weekCount:1});
 assert.deepEqual(result.inPreparation,[week]);
 assert.deepEqual(result.unavailable,[]);
 assert.deepEqual(result.weeks,[]);
});

test('pending publication and a failed connection are counted separately and are retried on refresh',async()=>{
 let published=false;
 const progress:UpcomingSnapshot[]=[];
 const reader=async(_key:string,date:string)=>{
  if(date===week&&!published)throw new ScheduleInPreparationError();
  if(date==='2027-02-01')throw new TypeError('No connection');
  return {schedule:empty(date),offline:false};
 };
 const result=await readUpcomingWeeks(key,week,reader,{weekCount:3,onProgress:value=>progress.push(value)});
 assert.deepEqual(result.inPreparation,[week]);
 assert.deepEqual(result.unavailable,['2027-02-01']);
 assert.equal(result.weeks.length,1);
 assert.equal(result.completed,3);
 assert.equal(progress[0].weeks.length+progress[0].inPreparation.length+progress[0].unavailable.length,1);
 published=true;
 const refreshed=await readUpcomingWeeks(key,week,reader,{weekCount:3});
 assert.deepEqual(refreshed.inPreparation,[]);
 assert.equal(refreshed.weeks.length,2);
 assert.deepEqual(result.inPreparation,[week]);
});

test('the notice identifies the full week, including a year boundary',()=>{
 assert.equal(assessmentWeekRange('2027-01-25'),'25. 1. 2027. – 31. 1. 2027.');
 assert.equal(assessmentWeekRange('2026-12-28'),'28. 12. 2026. – 3. 1. 2027.');
});
