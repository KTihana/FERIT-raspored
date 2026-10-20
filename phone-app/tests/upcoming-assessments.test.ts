import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FERIT_URL,parseSchedule,type Schedule} from '../lib/ferit.ts';
import {upcomingAssessments} from '../lib/assessments.ts';
import {readUpcomingWeeks,assessmentCountdown,type UpcomingSnapshot} from '../lib/upcoming-assessments.ts';

const html=readFileSync(new URL('./fixtures/3-53-2026-12-07.html',import.meta.url),'utf8');
const empty=(key:string,week:string):Schedule=>({lessons:[],fetchedAt:'2026-10-14T10:00:00Z',sourceUrl:`${FERIT_URL}/${week}/${key}`,teachingWeek:''});

test('the upcoming list actually fetches the future December week and includes AV assignments',async()=>{
 const fetched:string[]=[];let active=0,maxActive=0;
 const result=await readUpcomingWeeks('3-53','2026-10-14',async(key,week)=>{
  active++;maxActive=Math.max(active,maxActive);fetched.push(week);await new Promise(resolve=>setTimeout(resolve,1));active--;
  return {schedule:week==='2026-12-07'?parseSchedule(html,key,`${FERIT_URL}/${week}/${key}`):empty(key,week),offline:false};
 });
 assert.equal(fetched.length,16);assert.ok(fetched.includes('2026-12-07'));assert.ok(maxActive<=3);
 assert.equal(result.from,'2026-10-12');assert.equal(result.through,'2027-01-31');assert.equal(result.completed,16);
 assert.deepEqual(result.unavailable,[]);
 const events=upcomingAssessments(result.weeks.flatMap(w=>w.schedule.lessons),'2026-10-14');
 assert.deepEqual(events.map(l=>[l.date,l.title,l.tags]),[['2026-12-11','Uvod u ekonomiku i management',['kontrolna zadaća']],['2026-12-12','Digitalne komunikacije',['kontrolna zadaća']]]);
});

test('unavailable weeks and saved offline weeks cannot be mistaken for verified empty results',async()=>{
 const progress:UpcomingSnapshot[]=[];
 const result=await readUpcomingWeeks('3-53','2026-12-07',async(key,week)=>{
  if(week==='2026-12-14')throw new Error('offline');
  return {schedule:week==='2026-12-07'?parseSchedule(html,key,`${FERIT_URL}/${week}/${key}`):empty(key,week),offline:true};
 },{weekCount:3,onProgress:snapshot=>progress.push(snapshot)});
 assert.equal(result.completed,3);assert.deepEqual(result.unavailable,['2026-12-14']);assert.equal(result.weeks.length,2);
 assert.ok(result.weeks.every(w=>w.offline));assert.equal(progress.length,3);
 assert.equal(progress[0].completed,1);assert.equal(progress[0].weeks.length+progress[0].unavailable.length,1);
});

test('a timetable from another study or week is unavailable instead of entering the list',async()=>{
 const schedule=parseSchedule(html,'3-53',`${FERIT_URL}/2026-12-07/3-53`);
 const wrongWeek=await readUpcomingWeeks('3-53','2026-10-14',async()=>({schedule,offline:false}),{weekCount:1});
 assert.deepEqual(wrongWeek.unavailable,['2026-10-12']);assert.deepEqual(wrongWeek.weeks,[]);
 const wrongStudy=await readUpcomingWeeks('1-53','2026-12-07',async()=>({schedule,offline:false}),{weekCount:1});
 assert.deepEqual(wrongStudy.unavailable,['2026-12-07']);
});

test('closing or changing schedules cancels outstanding checks without publishing stale results',async()=>{
 const controller=new AbortController();let progress=0;
 await assert.rejects(readUpcomingWeeks('3-53','2026-10-14',async(key,week)=>{
  await Promise.resolve();controller.abort();return {schedule:empty(key,week),offline:false};
 },{signal:controller.signal,onProgress:()=>progress++}),{name:'AbortError'});
 assert.equal(progress,0);
});

test('countdowns use calendar days across DST and retain the real December 12 date',()=>{
 assert.equal(assessmentCountdown('2026-12-12','2026-10-14'),'Za 59 dana');
 assert.equal(assessmentCountdown('2026-12-12','2026-12-11'),'Sutra');
 assert.equal(assessmentCountdown('2026-12-12','2026-12-12'),'Danas');
 assert.equal(assessmentCountdown('2026-10-26','2026-10-24'),'Za 2 dana');
});
