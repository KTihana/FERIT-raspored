import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSchedule,applyPersonal,filterCourseGroups,type Lesson} from '../lib/ferit.ts';
import {lessonTags,lessonTypeLabel,assessmentTags,assessmentCategory,assessmentFilters,filterAssessments,upcomingAssessments} from '../lib/assessments.ts';

// Public FERIT markup downloaded for the student's actual programme and December week.
const html=readFileSync(new URL('./fixtures/3-53-2026-12-07.html',import.meta.url),'utf8');
const source='https://www.ferit.unios.hr/studenti/raspored-nastave-i-ispita/2026-12-07/3-53';
const schedule=parseSchedule(html,'3-53',source);
const assignment=schedule.lessons.find(l=>l.date==='2026-12-12'&&l.title==='Digitalne komunikacije')!;

test('real December 12 AV preserves its kontrolna zadaća annotation and every event detail',()=>{
 assert.ok(assignment);
 assert.equal(assignment.type,'AV');
 assert.equal(assignment.typeLabel,'AV - auditorne vježbe');
 assert.deepEqual(assignment.tags,['kontrolna zadaća']);
 assert.deepEqual([assignment.date,assignment.start,assignment.end,assignment.room,assignment.teacher,assignment.group,assignment.courseCode],['2026-12-12','08:00','09:30','T2-14','MANDRIĆ VANJA','SR-AV','SR5-01']);
 assert.equal(assignment.sourceUrl,source);
 assert.equal(schedule.lessons.length,14);
 assert.equal(assessmentCategory(assignment),'assignment');
});

test('both actual AV assignments appear in date order despite the selected LV group',()=>{
 const filtered=filterCourseGroups(schedule.lessons,{'3-53:SR5-01:LV':'SR-LV3'});
 const upcoming=upcomingAssessments(filtered,'2026-10-14');
 assert.deepEqual(upcoming.map(l=>[l.date,l.title]),[['2026-12-11','Uvod u ekonomiku i management'],['2026-12-12','Digitalne komunikacije']]);
 assert.equal(assessmentCategory(schedule.lessons.find(l=>l.type==='KV')!),null);
 assert.equal(upcomingAssessments(filtered,'2026-12-12','09:30').length,0);
 assert.deepEqual(upcomingAssessments([...filtered,assignment],'2026-12-12','08:30').map(l=>l.id),[assignment.id]);
});

function annotated(annotation:string,typeLabel='AV - auditorne vježbe'){
 return parseSchedule(`<div id="raspored"><div class="dan"><div class="naziv-dan">12.12.2026.</div><div class="blokovi blok123 AV"><p>Digitalne komunikacije<br>T2-14<br><i>${annotation}</i>(30/30)</p><span class="hide">${typeLabel}<br><a href="/upisi-i-studijski-programi/strucni#SR5-01">Digitalne komunikacije (SR5-01)</a> ${annotation}<br>08:00 - 09:30<br><a href="/fakultet/imenik-djelatnika#vanja-mandric">MANDRIĆ VANJA</a><br>Otvori grupu SR-AV</span></div></div></div>`,'3-53',source).lessons[0];
}

test('source tags are preserved verbatim, deduplicated and recognized independently of teaching codes',()=>{
 for(const [tag,category] of [['1. kontrolna zadaća','assignment'],['teorijski kolokvij','colloquium'],['2. kolokvij','colloquium'],['Predrok','pre-exam'],['pismeni ispit','exam'],['usmeni ispit','exam'],['obrana projekta','other'],['Nova oznaka profesora','other']] as const){
  const lesson=annotated(tag);
  assert.deepEqual(lesson.tags,[tag]);
  assert.deepEqual(lessonTags(lesson),[tag]);
  assert.equal(assessmentCategory(lesson),category);
  assert.equal(upcomingAssessments([lesson],'2026-12-11').length,1);
 }
 assert.equal(assessmentCategory(annotated('(izborni)')),null);
 assert.deepEqual(lessonTags(annotated('(izborni)')),['(izborni)']);
});

test('standalone assessment types stay visible and unknown types never become ISPIT',()=>{
 const exam=annotated('','Ispit');
 assert.equal(exam.type,'ISPIT');assert.deepEqual(lessonTags(exam),['Ispit']);
 assert.equal(assessmentCategory(exam),'exam');assert.equal(lessonTypeLabel(exam),'Ispit');
 const unknown=annotated('','Novi oblik nastave');
 assert.equal(unknown.type,'OSTALO');assert.equal(lessonTypeLabel(unknown),'Novi oblik nastave');
 assert.deepEqual(lessonTags(unknown),['Novi oblik nastave']);
 assert.equal(assessmentCategory(unknown),'other');
 const custom=annotated('','KZ - kontrolna zadaća');
 assert.equal(custom.type,'KZ');assert.equal(assessmentCategory(custom),'assignment');
 const embedded=annotated('','AV - auditorne vježbe · kontrolna zadaća');
 assert.equal(embedded.type,'AV');assert.equal(assessmentCategory(embedded),'assignment');
 assert.deepEqual(lessonTags(embedded),['AV - auditorne vježbe · kontrolna zadaća']);
});

test('notes published on their own detail line are preserved instead of discarded',()=>{
 const extended=html.replace('AV - auditorne vježbe<br />','AV - auditorne vježbe<br />Nova napomena profesora<br />');
 const result=parseSchedule(extended,'3-53',source);
 assert.ok(result.lessons.some(l=>l.tags?.includes('Nova napomena profesora')));
});

test('a refreshed source annotation cannot be hidden by an older personal edit',()=>{
 const original={...assignment,tags:undefined};
 const edited={...original,room:'Moja lokacija',note:'Moja napomena'};
 const result=applyPersonal([assignment],{[assignment.id]:{original,edited}},[],'3-53')[0];
 assert.deepEqual(lessonTags(result),['kontrolna zadaća']);
 assert.equal(result.sourceChanged,true);assert.equal(result.room,'Moja lokacija');assert.equal(result.note,'Moja napomena');
 assert.equal(upcomingAssessments([result],'2026-10-14').length,1);
 const removed=applyPersonal([{...assignment,tags:undefined}],{[assignment.id]:{original:assignment,edited:{...assignment,room:'Moja lokacija'}}},[],'3-53')[0];
 assert.deepEqual(lessonTags(removed),[]);
});

test('older saved lessons work without tags and personal events are not classified as FERIT assessments',()=>{
 const older={...assignment,tags:undefined};
 assert.deepEqual(lessonTags(older),[]);assert.equal(assessmentCategory(older),null);
 const saved=JSON.parse(JSON.stringify(assignment)) as Lesson;
 assert.deepEqual(lessonTags(saved),['kontrolna zadaća']);assert.deepEqual(saved.tags,['kontrolna zadaća']);
 assert.equal(assessmentCategory({...saved,personal:true}),null);
 assert.deepEqual(lessonTags({...saved,personal:true}),[]);
 assert.equal(lessonTypeLabel(assignment,true),'AV - auditorne vježbe');
});

test('filters use the exact published tags and never invent broader category labels',()=>{
 const theory={...annotated('teorijski kolokvij'),id:'theory',sourceId:'theory'};
 const first={...annotated('1. kontrolna zadaća'),id:'first',sourceId:'first'};
 const unknown={...annotated('Provjera projekta'),id:'unknown',sourceId:'unknown'};
 const events=upcomingAssessments([assignment,theory,first,unknown,annotated('(izborni)')],'2026-10-14');
 const filters=assessmentFilters(events);
 assert.deepEqual(filters.map(filter=>filter.label),['Sve','1. kontrolna zadaća','kontrolna zadaća','Provjera projekta','teorijski kolokvij','Ostalo']);
 for(const filter of filters.filter(filter=>filter.id.startsWith('source:'))){
  const matching=filterAssessments(events,filter.id);
  assert.ok(matching.length);
  assert.ok(matching.every(lesson=>lessonTags(lesson).includes(filter.label)));
 }
 assert.ok(!filters.some(filter=>['Kolokviji','Ispiti','Predrokovi','Zadaće','Kolokvij'].includes(filter.label)));
 assert.deepEqual(assessmentFilters([assignment,assignment]).map(filter=>filter.label),['Sve','kontrolna zadaća','Ostalo']);
 assert.deepEqual(filterAssessments(events,'other'),[]);
});

test('personal events require explicit opt-in and appear only in Sve and Ostalo',()=>{
 const personal:Lesson={...assignment,id:'personal',sourceId:undefined,personal:true,type:'OSOBNO',typeLabel:'Osobni događaj',title:'Moj ispit',note:'kontrolna zadaća',date:'2026-12-10'};
 assert.deepEqual(upcomingAssessments([personal],'2026-10-14'),[]);
 assert.deepEqual(upcomingAssessments([{...personal,includeInAssessments:false}],'2026-10-14'),[]);
 const saved=JSON.parse(JSON.stringify({...personal,includeInAssessments:true})) as Lesson;
 const combined=applyPersonal([assignment],{},[saved,{...saved,id:'another-programme',scheduleKey:'1-53'}],'3-53');
 const events=upcomingAssessments(combined,'2026-10-14');
 assert.deepEqual(events.map(lesson=>lesson.id),['personal',assignment.id]);
 assert.deepEqual(filterAssessments(events,'all').map(lesson=>lesson.id),['personal',assignment.id]);
 assert.deepEqual(filterAssessments(events,'other').map(lesson=>lesson.id),['personal']);
 const sourceFilter=assessmentFilters(events).find(filter=>filter.label==='kontrolna zadaća')!;
 assert.deepEqual(filterAssessments(events,sourceFilter.id).map(lesson=>lesson.id),[assignment.id]);
 assert.deepEqual(lessonTags(saved),[]);
 assert.deepEqual(assessmentFilters([saved]).map(filter=>filter.label),['Sve','Ostalo']);
 assert.equal(assessmentCategory(saved),'other');
 assert.deepEqual(upcomingAssessments([saved],'2026-12-10','09:30'),[]);
});

test('unchecking inclusion keeps the event in the schedule and removes it from assessments',()=>{
 const personal:Lesson={...assignment,id:'personal',personal:true,includeInAssessments:true};
 const edited=JSON.parse(JSON.stringify({...personal,includeInAssessments:false})) as Lesson;
 const schedule=applyPersonal([],{},[edited],'3-53');
 assert.equal(schedule.length,1);
 assert.equal(schedule[0].id,'personal');
 assert.deepEqual(upcomingAssessments(schedule,'2026-10-14'),[]);
 assert.deepEqual(filterAssessments(schedule,'all'),[]);
 assert.deepEqual(filterAssessments(schedule,'other'),[]);
 assert.deepEqual(upcomingAssessments(applyPersonal([],{},[],'3-53'),'2026-10-14'),[]);
});

test('actual labels across different programmes survive parsing without elective metadata or unknown-type filters',()=>{
 const fixtures=JSON.parse(readFileSync(new URL('./fixtures/source-labels.json',import.meta.url),'utf8')) as {url:string;key:string;html:string}[];
 const lessons=fixtures.flatMap(fixture=>parseSchedule(fixture.html,fixture.key,fixture.url).lessons);
 const events=upcomingAssessments(lessons,'2026-10-01');
 assert.deepEqual(assessmentFilters(events).map(filter=>filter.label),['Sve','Kolokvij','kontrolna zadaća','LV-kolokvij (SA,SE gr.)','LV-kolokvij (SR gr.)','Obrana ZR','teorijski kolokvij','Usmeni','Ostalo']);
 const elective=events.find(lesson=>lesson.title==='Elektromagnetska kompatibilnost')!;
 assert.deepEqual(lessonTags(elective),['(izborni)','Kolokvij']);
 assert.deepEqual(assessmentTags(elective),['Kolokvij']);
 assert.equal(lessonTypeLabel(elective,true),'Nepoznato');
 assert.ok(events.some(lesson=>lesson.type==='PR'&&lesson.tags?.includes('teorijski kolokvij')));
 assert.ok(events.some(lesson=>lesson.type==='AV'&&lesson.tags?.includes('kontrolna zadaća')));
 const consultations=lessons.find(lesson=>lesson.tags?.includes('grupne konzultacije (SA,SE gr.)'))!;
 assert.deepEqual(lessonTags(consultations),['grupne konzultacije (SA,SE gr.)']);
 assert.equal(assessmentCategory(consultations),null);
});

test('verified teaching notices remain in the timetable without becoming assessment filters',()=>{
 for(const tag of ['Nastava','Predavanje','predavanja Hederić','Nadoknada predavanja','nadoknada','Auditorne vježbe u T2-31','AV1 u K2-1','erasmus web','grupne konzultacije (SR gr.)']){
  const lesson=annotated(tag,'Nepoznato');
  assert.deepEqual(lessonTags(lesson),[tag]);
  assert.equal(assessmentCategory(lesson),null,tag);
  assert.deepEqual(assessmentFilters([lesson]).map(filter=>filter.label),['Sve','Ostalo']);
 }
 assert.equal(assessmentCategory(annotated('','Nepoznato')),null);
 assert.deepEqual(lessonTags(annotated('Nadoknada kontrolne zadaće')),['Nadoknada kontrolne zadaće']);
 assert.equal(upcomingAssessments([annotated('Nadoknada kontrolne zadaće')],'2026-10-14').length,1);
});
