import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyPersonal,filterCourseGroups,type Lesson} from '../lib/ferit.ts';
import {combinedPersonalSchedule} from '../lib/repeating-courses.ts';
import {lessonLanes,overlappingLessons} from '../lib/timetable-layout.ts';

const lesson=(id:string,start='12:00',end='13:00'):Lesson=>({id,scheduleKey:'3-53',date:'2026-10-23',title:id,courseCode:id,start,end,room:'',type:'PR',typeLabel:'',teacher:'',group:'',progress:''});

test('exact, partial and nested overlaps are warnings; self, other dates and adjacent events are excluded',()=>{
 const draft={...lesson('draft'),personal:true};
 const lessons=[draft,lesson('exact'),lesson('earlier','11:00','12:15'),lesson('later','12:45','14:00'),lesson('nested','12:20','12:30'),lesson('containing','11:00','14:00'),lesson('before','11:00','12:00'),lesson('after','13:00','14:00'),{...lesson('tomorrow'),date:'2026-10-24'}];
 assert.deepEqual(overlappingLessons(draft,lessons).map(l=>l.id),['exact','earlier','later','nested','containing']);
 for(const [start,end] of [['13:00','12:00'],['12:00','12:00'],['24:00','25:00'],['12:00','invalid']])assert.deepEqual(overlappingLessons({...draft,start,end},lessons),[]);
});

test('warnings use visible groups, personal edits and repeating subjects across source schedules',()=>{
 const draft={...lesson('draft'),personal:true};
 const lab={...lesson('lab'),type:'LV',courseCode:'LAB',group:'SR-LV1'};
 const hidden=lesson('hidden');const moved=lesson('moved','10:00','11:00');
 const repeated={...lesson('repeated'),scheduleKey:'2-53'};
 const all=combinedPersonalSchedule([lab,{...lab,id:'other-group',group:'SR-LV2'},hidden,moved,repeated],{
  hidden:{original:hidden,hidden:true},moved:{original:moved,edited:{...moved,start:'12:15',end:'12:45'}}
 },[draft],'3-53',[{scheduleKey:'2-53',courseCode:'repeated',title:'repeated',selectedTypes:['PR']}]);
 const visible=filterCourseGroups(all,{'3-53:LAB:LV':'SR-LV1'});
 assert.deepEqual(overlappingLessons(draft,visible).map(l=>l.id).sort(),['lab','moved','repeated']);
});

test('multiple events at the identical time survive persistence and keep separate lanes',()=>{
 const source=lesson('lecture');
 const personal=[{...lesson('event-a'),personal:true},{...lesson('event-b'),personal:true}];
 const saved=JSON.parse(JSON.stringify(personal));
 const merged=applyPersonal([source],{},saved,'3-53');
 assert.equal(merged.length,3);
 const slots=lessonLanes(merged);
 assert.deepEqual([...slots.values()],[{lane:0,count:3,span:1},{lane:1,count:3,span:1},{lane:2,count:3,span:1}]);
 assert.deepEqual(personal.map(l=>l.id),['event-a','event-b']);
});

test('chained overlaps never share horizontal space, while non-overlapping events reuse it',()=>{
 const lessons=[lesson('a','08:00','11:00'),lesson('b','08:30','09:30'),lesson('c','09:00','10:00'),lesson('d','10:00','12:00'),lesson('e','12:00','13:00')];
 const slots=lessonLanes([...lessons].reverse());
 for(const a of lessons)for(const b of overlappingLessons(a,lessons)){
  const left=slots.get(a.id)!,right=slots.get(b.id)!;
  assert.ok(left.lane+left.span<=right.lane||right.lane+right.span<=left.lane,`${a.id} covers ${b.id}`);
 }
 assert.deepEqual(slots.get('e'),{lane:0,count:1,span:1});
 assert.equal(slots.get('d')!.span,2);
});
