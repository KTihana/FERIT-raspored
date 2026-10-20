import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FERIT_URL,parseCatalogue,parseSchedule,courseGroupKey,filterCourseGroups,type Lesson,type Schedule,type Study} from '../lib/ferit.ts';
import {EMPTY_REPEATING,repeatingYearOptions,repeatingCourseId,repeatingLessonType,mergeRepeatingCourses,activeRepeatingCourses,combinedPersonalSchedule} from '../lib/repeating-courses.ts';
import {readUpcomingWeeks} from '../lib/upcoming-assessments.ts';
import {upcomingAssessments} from '../lib/assessments.ts';
import {createOfflineScheduleLoader} from '../lib/offline-schedule.ts';
import {resetPersonalSchedule} from '../lib/reset-schedule.ts';

const week='2026-10-19';
const html=(key:string)=>readFileSync(new URL(`./fixtures/${key}-${week}.html`,import.meta.url),'utf8');
const studies=parseCatalogue(html('3-53'));
const source=(key:string)=>parseSchedule(html(key),key,`${FERIT_URL}/${week}/${key}`);
const main=source('3-53'),previous=source('2-53');
const java=mergeRepeatingCourses([],previous.lessons).find(c=>c.title==='Programiranje u Javi')!;
assert.ok(java);

test('each subject exposes only its observed teaching types with FERIT labels',()=>{
 const courses=mergeRepeatingCourses([],previous.lessons);
 assert.deepEqual(java.types,[{id:'LV',label:'LV - laboratorijske vježbe'},{id:'PR',label:'PR - predavanja'}]);
 assert.deepEqual(courses.find(c=>c.title==='Osnove 3D modeliranja')?.types,[{id:'PR',label:'PR - predavanja'}]);
 assert.deepEqual(courses.find(c=>c.title==='Algoritmi diskretne matematike')?.types?.map(t=>t.id),['AV','PR']);
 assert.ok(courses.every(c=>!c.types?.some(t=>t.id==='KV')));
});

test('types are merged across weeks and remembered offline without manufacturing missing choices',()=>{
 const base=previous.lessons.find(l=>l.courseCode===java.courseCode)!;
 const known=mergeRepeatingCourses([],previous.lessons);
 const merged=mergeRepeatingCourses(known,[{...base,id:'later-kv',type:'KV',typeLabel:'KV - konstrukcijske vježbe'}]);
 const remembered=mergeRepeatingCourses(JSON.parse(JSON.stringify(merged)),[]);
 assert.deepEqual(remembered,merged);
 assert.deepEqual(remembered.find(c=>c.courseCode===java.courseCode)?.types?.map(t=>t.id),['KV','LV','PR']);
 assert.deepEqual(remembered.find(c=>c.title==='Osnove 3D modeliranja')?.types?.map(t=>t.id),['PR']);
 const legacy={scheduleKey:java.scheduleKey,courseCode:java.courseCode,title:java.title};
 assert.deepEqual(mergeRepeatingCourses([legacy],[])[0].types,[]);
 assert.deepEqual(mergeRepeatingCourses([legacy],previous.lessons).find(c=>c.courseCode===java.courseCode)?.types,java.types);
});

test('lecture-only and lab-only selections filter occurrences and assessment entries independently',()=>{
 const source=[...main.lessons,...previous.lessons.map(l=>l.courseCode===java.courseCode?{...l,tags:['Kolokvij']}:l)];
 for(const type of ['PR','LV']){
  const selected={...java,selectedTypes:[type]};
  const visible=combinedPersonalSchedule(source,{},[],'3-53',[selected]);
  assert.equal(visible.filter(l=>l.scheduleKey==='3-53').length,main.lessons.length);
  assert.ok(visible.some(l=>l.courseCode===java.courseCode));
  assert.ok(visible.filter(l=>l.scheduleKey==='2-53').every(l=>l.type===type));
  assert.ok(upcomingAssessments(visible,week).filter(l=>l.scheduleKey==='2-53').every(l=>l.type===type));
 }
 assert.deepEqual(activeRepeatingCourses(studies,'3-53',{courses:[{...java,selectedTypes:[]}]}),[]);
});

test('explicit type choices survive new types, personal edits, cache round trips and legacy settings',()=>{
 const original=previous.lessons.find(l=>l.courseCode===java.courseCode&&l.type==='LV')!;
 const selected={...java,selectedTypes:['PR']};
 const reopened=JSON.parse(JSON.stringify({courses:[selected]}));
 const courses=activeRepeatingCourses(studies,'3-53',reopened);
 const kv={...original,id:'new-kv',type:'KV',typeLabel:'KV - konstrukcijske vježbe'};
 const edits={[original.id]:{original,edited:{...original,date:'2026-10-20',start:'19:00',end:'20:00'}}};
 const visible=combinedPersonalSchedule([...main.lessons,...previous.lessons,kv],edits,[],'3-53',courses);
 assert.ok(!visible.some(l=>l.id===original.id||l.id===kv.id));
 const legacy={enabled:true,courses:[{scheduleKey:java.scheduleKey,courseCode:java.courseCode,title:java.title}]};
 assert.equal(combinedPersonalSchedule(previous.lessons,{},[],'3-53',activeRepeatingCourses(studies,'3-53',legacy)).length,previous.lessons.filter(l=>l.courseCode===java.courseCode).length);
 assert.deepEqual(activeRepeatingCourses(studies,'3-53',{...legacy,enabled:false}),[]);
});

test('unclassified source types keep separate labels rather than collapsing into a generic choice',()=>{
 const base=previous.lessons[0];
 const lessons=[{...base,type:'OSTALO',typeLabel:'Radionica'},{...base,id:'other',type:'OSTALO',typeLabel:'Konzultacije'}];
 const courses=mergeRepeatingCourses([],lessons);
 assert.equal(courses[0].types?.length,2);
 const selected={...courses[0],selectedTypes:[repeatingLessonType(lessons[0])]};
 assert.deepEqual(combinedPersonalSchedule(lessons,{},[],'3-53',[selected]).map(l=>l.typeLabel),['Radionica']);
});

test('only the immediately preceding year of the same programme is offered',()=>{
 assert.deepEqual(repeatingYearOptions(studies,'3-53').map(o=>o.key),['2-53']);
 assert.deepEqual(repeatingYearOptions(studies,'2-53').map(o=>o.key),['1-53']);
 assert.deepEqual(repeatingYearOptions(studies,'1-53'),[]);
 assert.deepEqual(repeatingYearOptions(studies,'missing'),[]);
 const custom:Study[]=[{name:'Programme',options:[
  {key:'3-1',year:3,exam:false,legacy:false,label:'3.g.',code:''},
  {key:'2-1',year:2,exam:false,legacy:true,label:'2.g. (stari)',code:''},
  {key:'2-2',year:2,exam:true,legacy:false,label:'2.g. (ispiti)',code:''},
 ]}];
 assert.deepEqual(repeatingYearOptions(custom,'3-1'),[]);
});

test('one subject checkbox includes all teaching types, with no duplicates across weeks',()=>{
 const courses=mergeRepeatingCourses([],previous.lessons);
 assert.equal(courses.filter(c=>c.courseCode===java.courseCode).length,1);
 assert.deepEqual(mergeRepeatingCourses(courses,[...previous.lessons,...previous.lessons]),courses);
 const combined=combinedPersonalSchedule([...main.lessons,...previous.lessons],{},[],'3-53',[java]);
 assert.equal(combined.filter(l=>l.scheduleKey==='3-53').length,main.lessons.length);
 assert.deepEqual(combined.filter(l=>l.scheduleKey==='2-53').map(l=>l.id).sort(),previous.lessons.filter(l=>l.courseCode===java.courseCode).map(l=>l.id).sort());
 assert.ok(combined.filter(l=>l.scheduleKey==='2-53').every(l=>l.repeatingYear===2));
 assert.ok(combined.some(l=>l.title==='Programiranje u Javi'&&l.date===week));
 assert.ok(!combined.some(l=>l.scheduleKey==='2-53'&&l.title==='Digitalna elektronika'));
});

test('opt in, opt out and schedule changes cannot leak first-year or unrelated subjects',()=>{
 const invalid=[java,{...java,scheduleKey:'1-53'},{...java,scheduleKey:'2-54'},{...java,scheduleKey:'3-53'}];
 assert.deepEqual(activeRepeatingCourses(studies,'3-53',EMPTY_REPEATING),[]);
 assert.deepEqual(activeRepeatingCourses(studies,'3-53',{enabled:false,courses:invalid}),[]);
 assert.deepEqual(activeRepeatingCourses(studies,'3-53',{enabled:true,courses:invalid}),[java]);
 assert.deepEqual(activeRepeatingCourses(studies,'1-53',{enabled:true,courses:[java]}),[]);
 assert.deepEqual(activeRepeatingCourses(studies,'3-54',{enabled:true,courses:[java]}),[]);
});

test('LV filters, edits, removals and renamed subjects retain their source identity',()=>{
 const original=previous.lessons.find(l=>l.courseCode===java.courseCode)!;
 const labs:Lesson[]=['LV1','LV2'].map(group=>({...original,id:group,type:'LV',group}));
 const lecture={...original,id:'lecture',type:'PR',group:'PR1'};
 const edited={...labs[1],title:'Java – vlastita napomena',start:'17:00',end:'18:00'};
 const overrides={LV2:{original:labs[1],edited},lecture:{original:lecture,hidden:true}};
 const personal={...original,id:'personal-main',scheduleKey:'3-53',personal:true};
 const combined=combinedPersonalSchedule([...main.lessons,...labs,lecture],overrides,[personal],'3-53',[java]);
 const visible=filterCourseGroups(combined,{[courseGroupKey(labs[0])]:'LV2'});
 assert.deepEqual(visible.filter(l=>l.scheduleKey==='2-53').map(l=>[l.id,l.title,l.edited,l.repeatingYear]),[['LV2',edited.title,true,2]]);
 assert.ok(visible.some(l=>l.id===personal.id));
 const moved=combinedPersonalSchedule(main.lessons,overrides,[],'3-53',[java]);
 assert.equal(moved.find(l=>l.id==='LV2')?.sourceChanged,true);
 assert.ok(!combinedPersonalSchedule([...main.lessons,...labs],overrides,[],'3-53',[]).some(l=>l.scheduleKey==='2-53'));
});

test('preferences survive reopening and reset, independently for each primary schedule',()=>{
 const preferences={repeating:{'3-53':{enabled:true,courses:[java]},'2-53':{enabled:false,courses:[]}},overrides:{},personal:[]};
 const reopened=JSON.parse(JSON.stringify(preferences));
 assert.deepEqual(activeRepeatingCourses(studies,'3-53',reopened.repeating['3-53']),[java]);
 const disabled={...reopened.repeating['3-53'],enabled:false};
 assert.deepEqual(activeRepeatingCourses(studies,'3-53',disabled),[]);
 assert.deepEqual(disabled.courses,[java]);
 assert.deepEqual(resetPersonalSchedule(reopened).repeating,preferences.repeating);
 assert.equal(repeatingCourseId(java),`2-53:${java.courseCode}`);
});

test('assessment reads include both years with bounded concurrency and flag partial failure',async()=>{
 let active=0,maxActive=0;const fetched:string[]=[];
 const javaAssessment={...previous.lessons.find(l=>l.courseCode===java.courseCode)!,tags:['Kolokvij'],type:'PR'};
 const unrelated={...previous.lessons.find(l=>l.courseCode!==java.courseCode)!,tags:['Kolokvij']};
 const result=await readUpcomingWeeks(['3-53','2-53','2-53'],week,async(key,date)=>{
  active++;maxActive=Math.max(maxActive,active);fetched.push(`${key}:${date}`);
  await new Promise(resolve=>setTimeout(resolve,1));active--;
  if(key==='2-53'&&date!==week)throw new Error('unavailable');
  return {schedule:{...(key==='3-53'?main:previous),lessons:date===week?(key==='3-53'?main.lessons:[javaAssessment,unrelated]):[]},offline:false};
 },{weekCount:2});
 assert.equal(result.total,4);assert.equal(result.completed,4);assert.equal(new Set(fetched).size,4);assert.ok(maxActive<=3);
 assert.deepEqual(result.unavailable,['2026-10-26']);
 const lessons=combinedPersonalSchedule(result.weeks.flatMap(w=>w.schedule.lessons),{},[],'3-53',[java]);
 const assessments=upcomingAssessments(lessons,week);
 assert.ok(assessments.some(l=>l.courseCode===java.courseCode));
 assert.ok(!assessments.some(l=>l.id===unrelated.id));
});

test('saved previous-year weeks remain available offline and never substitute a different week',async()=>{
 const values=new Map<string,string>();let online=true;
 const storage={get:async(key:string)=>values.get(key)??null,set:async(key:string,value:string)=>{values.set(key,value);},keys:async()=>[...values.keys()]};
 const read=async(key:string):Promise<Schedule>=>{if(!online)throw new Error('offline');return key==='3-53'?main:previous;};
 const loader=createOfflineScheduleLoader(read,storage);
 await Promise.all(['3-53','2-53'].map(key=>loader.load(key,week)));
 online=false;
 const reopened=createOfflineScheduleLoader(read,storage);
 const saved=await Promise.all(['3-53','2-53'].map(key=>reopened.load(key,week,{allowLastSaved:false})));
 assert.ok(saved.every(result=>result.offline));
 const lessons=combinedPersonalSchedule(saved.flatMap(result=>result.snapshot.schedule.lessons),{},[],'3-53',[java]);
 assert.ok(lessons.some(l=>l.courseCode===java.courseCode));
 await assert.rejects(reopened.load('2-53','2026-10-26',{allowLastSaved:false}),{name:'ScheduleUnavailableError'});
});
