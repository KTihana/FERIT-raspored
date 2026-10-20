import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCatalogue,parseSchedule,addDays,monday,applyPersonal,courseGroupKey,filterCourseGroups,studyChoices,mergeLabCourses,swipeDirection,type Lesson} from '../lib/ferit.ts';
const html=readFileSync(new URL('./fixtures/3-53.html',import.meta.url),'utf8');
const schedule=parseSchedule(html,'3-53','https://www.ferit.unios.hr/');
test('parses all current study categories and their real routes',()=>{const catalogue=parseCatalogue(html);assert.equal(catalogue.length,16);assert.equal(catalogue.flatMap(s=>s.options).filter(o=>!o.legacy).length,62);const sr=catalogue.find(s=>s.name==='Stručni studij Računarstvo')!;assert.deepEqual(sr.options.map(o=>o.key),['1-53','2-53','3-53']);const ee=catalogue.find(s=>s.name.includes('diplomski')&&s.name.includes('Elektroenergetika'))!;assert.ok(ee.options.some(o=>o.exam));});
test('preserves class times, teacher, LV group, room and course metadata',()=>{const l=schedule.lessons.find(l=>l.date==='2026-10-13'&&l.type==='LV')!;assert.equal(l.title,'Programsko inženjerstvo');assert.equal(l.start,'08:00');assert.equal(l.end,'11:00');assert.equal(l.room,'K3-12');assert.equal(l.courseCode,'SR5-02');assert.equal(l.group,'SR-LV3');assert.equal(l.teacher,'BOŠNJAK ANDREJ');assert.equal(l.progress,'(4/30)');assert.equal(schedule.lessons.length,11);});
test('a valid empty timetable is different from a changed page format',()=>{assert.equal(parseSchedule('<div id="raspored"><div class="dan"><div class="naziv-dan">Uto 13.10.2026.</div></div></div>','3-53','').lessons.length,0);assert.throws(()=>parseSchedule('<html>raspored unavailable</html>','3-53',''));});
test('calendar arithmetic is independent of DST and supports Sunday weeks',()=>{assert.equal(addDays('2026-10-25',1),'2026-10-26');assert.equal(monday('2026-10-18'),'2026-10-12');assert.equal(addDays('2026-12-31',1),'2027-01-01');});
test('LV groups are selected separately for each subject',()=>{const l=schedule.lessons[0];const samples:Lesson[]=[{...l,id:'p2',courseCode:'PI',group:'SR-LV2'},{...l,id:'p3',courseCode:'PI',group:'SR-LV3'},{...l,id:'w2',courseCode:'WEB',group:'SR-LV2'},{...l,id:'w3',courseCode:'WEB',group:'SR-LV3'},{...l,id:'pr',courseCode:'PI',type:'PR',group:'SR-PR'}];const result=filterCourseGroups(samples,{[courseGroupKey(samples[0])]:'SR-LV2',[courseGroupKey(samples[2])]:'SR-LV3'});assert.deepEqual(result.map(l=>l.id),['p2','w3','pr']);});
test('personal changes survive refresh and signal changes in the original',()=>{const l=schedule.lessons[0];const edited={...l,start:'09:00'};const overrides={[l.id]:{original:l,edited}};assert.equal(applyPersonal([l],overrides,[],'3-53')[0].start,'09:00');assert.equal(applyPersonal([{...l,room:'K1-1'}],overrides,[],'3-53')[0].sourceChanged,true);assert.equal(applyPersonal([],overrides,[],'3-53')[0].sourceChanged,true);assert.equal(applyPersonal([l],{[l.id]:{original:l,hidden:true}},[],'3-53').length,0);assert.equal(applyPersonal([],{},[{...l,personal:true}], '1-65').length,0);});
test('study picker preserves FERIT headings, option labels, order and exact routes',()=>{
 const studies=parseCatalogue(html);const choices=studyChoices(studies);
 assert.equal(choices.flatMap(c=>c.options).length,62);
 assert.deepEqual(choices.map(c=>({name:c.label,options:c.options})),studies.map(s=>({name:s.name,options:s.options.filter(o=>!o.legacy)})));
 const computing=choices.find(c=>c.study==='Sveučilišni prijediplomski studij Računarstvo')!;
 assert.deepEqual(computing.options.map(o=>o.label),['1.g. PI','1.g. RI','2.g. PI','2.g. RI','3.g. PI','3.g. RI']);
 assert.deepEqual(choices.find(c=>c.label==='Stručni studij Računarstvo')!.options.map(o=>[o.label,o.key]),[['1.g.','1-53'],['2.g.','2-53'],['3.g.','3-53']]);
 assert.deepEqual(choices.find(c=>c.label==='Stručni studij Računarstvo - Vinkovci')!.options.map(o=>[o.label,o.key]),[['1.g.','1-62'],['2.g.','2-62'],['3.g.','3-62']]);
 const dkb=choices.find(c=>c.label.includes('smjer Komunikacije i informatika'))!.options.filter(o=>o.code==='DKB');
 assert.deepEqual(dkb.map(o=>[o.label,o.key]),[['DKB 1.g.','1-95'],['DKB 2.g.','2-35']]);
 assert.deepEqual(choices.filter(c=>c.label.includes('Automobilsko')).map(c=>c.options.map(o=>o.key)),[['1-52','2-52'],['1-58','2-58']]);
 const legacy=studies.flatMap(s=>s.options).find(o=>o.legacy)!;
 assert.ok(studyChoices(studies,legacy.key).some(c=>c.options.some(o=>o.key===legacy.key)));
});
test('a different timetable returned by FERIT cannot be shown as the selected one',()=>{
 assert.throws(()=>parseSchedule(html,'3-62',''),/drugi raspored/);
});
test('course groups include LV3 and retain alternatives absent from the current week',()=>{
 const courses=mergeLabCourses([],schedule.lessons);
 for(const c of courses)assert.deepEqual(c.groups,['SR-LV1','SR-LV2','SR-LV3']);
 const onlyLv2=schedule.lessons.filter(l=>l.group==='SR-LV2');
 assert.deepEqual(mergeLabCourses(courses,onlyLv2),courses);
 const adjacent={...onlyLv2[0],group:'SR-LV4'};
 assert.ok(mergeLabCourses(courses,[adjacent]).find(c=>c.id===courseGroupKey(adjacent))!.groups.includes('SR-LV4'));
});
test('sideways week swipes follow the rotated timetable and ignore vertical scrolling',()=>{
 assert.equal(swipeDirection(-100,10),1);assert.equal(swipeDirection(100,10),-1);
 assert.equal(swipeDirection(10,-100,true),1);assert.equal(swipeDirection(10,100,true),-1);
 assert.equal(swipeDirection(100,10,true),0);assert.equal(swipeDirection(10,100),0);
});
