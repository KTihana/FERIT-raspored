import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLongPress} from '../lib/long-press.ts';
import {storedTheme} from '../lib/theme.ts';
function fakeClock(){
 let now=0;let next=0;const tasks=new Map<number,{at:number;callback:()=>void}>();
 return {set(callback:()=>void,delay:number){const id=++next;tasks.set(id,{at:now+delay,callback});return id;},clear(timer:unknown){tasks.delete(timer as number);},advance(ms:number){now+=ms;for(const [id,t]of tasks){if(t.at<=now){tasks.delete(id);t.callback();}}}};
}
const point={x:100,y:100,pointerId:1};
test('a tap never edits, while a stationary hold edits exactly once',()=>{
 const timers=fakeClock();let opens=0;const press=createLongPress(()=>opens++,timers);
 press.start(point);timers.advance(100);press.release(1);timers.advance(600);assert.equal(opens,0);
 press.start(point);timers.advance(549);assert.equal(opens,0);timers.advance(1);assert.equal(opens,1);
 press.release(1);timers.advance(1000);assert.equal(opens,1);
});
test('scrolling, swiping, pointer cancellation and unmounting cannot open an editor later',()=>{
 const timers=fakeClock();let opens=0;const press=createLongPress(()=>opens++,timers);
 press.start(point);press.move({...point,y:120});timers.advance(600);
 press.start(point);press.move({...point,x:180});timers.advance(600);
 press.start(point);press.cancel(1);timers.advance(600);
 press.start(point);press.cancel();timers.advance(600);
 assert.equal(opens,0);
});
test('minor finger jitter and unrelated pointer releases do not cancel a hold',()=>{
 const timers=fakeClock();let opens=0;const press=createLongPress(()=>opens++,timers);
 press.start(point);press.move({...point,x:104,y:105});press.cancel(2);timers.advance(550);assert.equal(opens,1);
});
test('the click following a hold is consumed so it cannot open read-only details too',()=>{
 const timers=fakeClock();let edits=0;const press=createLongPress(()=>edits++,timers);
 press.start(point);timers.advance(550);press.release(1);
 assert.equal(edits,1);assert.equal(press.consumeTap(),false);
 press.start(point);timers.advance(80);press.release(1);assert.equal(press.consumeTap(),true);
});
test('a valid tap can open details while movement and browser cancellation suppress the click',()=>{
 const timers=fakeClock();let edits=0;const press=createLongPress(()=>edits++,timers);
 press.start(point);timers.advance(80);press.release(1);assert.equal(press.consumeTap(),true);
 press.start(point);press.move({...point,x:180});press.release(1);assert.equal(press.consumeTap(),false);
 press.start(point);press.cancel(1);assert.equal(press.consumeTap(),false);
 press.start(point);press.cancel();assert.equal(press.consumeTap(),false);
 timers.advance(1000);assert.equal(edits,0);
});
test('touch release followed by pointerleave before click still opens details exactly once',()=>{
 const timers=fakeClock();let edits=0;let details=0;const press=createLongPress(()=>edits++,timers);
 press.start(point);timers.advance(80);press.release(point.pointerId);press.cancel(point.pointerId);
 if(press.consumeTap())details++;
 timers.advance(1000);assert.equal(details,1);assert.equal(edits,0);
});
test('leaving an active class, cancelled scrolling and a held finger never become taps on release',()=>{
 const timers=fakeClock();let edits=0;const press=createLongPress(()=>edits++,timers);
 press.start(point);press.cancel(point.pointerId);press.release(point.pointerId);press.cancel(point.pointerId);
 assert.equal(press.consumeTap(),false);
 press.start(point);press.move({...point,y:122});press.release(point.pointerId);press.cancel(point.pointerId);
 assert.equal(press.consumeTap(),false);
 press.start(point);timers.advance(550);press.release(point.pointerId);press.cancel(point.pointerId);
 assert.equal(press.consumeTap(),false);assert.equal(edits,1);
 press.start(point);press.release(point.pointerId);press.cancel(point.pointerId);assert.equal(press.consumeTap(),true);
});
test('another pointer cannot release the pressed class',()=>{
 const timers=fakeClock();let edits=0;const press=createLongPress(()=>edits++,timers);
 press.start(point);press.release(2);timers.advance(550);assert.equal(edits,1);
 assert.equal(press.consumeTap(),false);
});
test('stored theme survives reopening and older preferences use the device theme',()=>{
 assert.equal(storedTheme('dark',false),'dark');assert.equal(storedTheme('light',true),'light');
 assert.equal(storedTheme(undefined,true),'dark');assert.equal(storedTheme(undefined,false),'light');
 assert.equal(storedTheme('unexpected',true),'dark');
});

test('personal colours, rooms and multiline notes survive saved preferences and FERIT refreshes',async()=>{
 const {applyPersonal,filterCourseGroups}=await import('../lib/ferit.ts');
 const {personalColor,PERSONAL_COLORS}=await import('../lib/event-colors.ts');
 for(const c of PERSONAL_COLORS){
  const note='Profesor je promijenio vrijeme.\nPonesi bilješke za konzultacije.';
  const personal={id:'personal-example',scheduleKey:'3-53',date:'2026-10-13',title:'Konzultacije',courseCode:'',start:'12:00',end:'13:00',room:'T2-14',type:'OSOBNO',typeLabel:'Osobni događaj',teacher:'',group:'',progress:'',personal:true,color:c.value,note};
  const saved=JSON.parse(JSON.stringify({personal:[personal]}));
  const refreshed=filterCourseGroups(applyPersonal([],{},saved.personal,'3-53'),{'3-53:Konzultacije:OSOBNO':'SR-LV3'});
  assert.equal(refreshed.length,1);assert.equal(refreshed[0].room,'T2-14');assert.equal(personalColor(refreshed[0].color),c.value);
  assert.equal(saved.personal[0].note,note);assert.equal(refreshed[0].note,note);
  assert.equal(refreshed[0].type,'OSOBNO');assert.equal(refreshed[0].personal,true);
  assert.equal(applyPersonal([],{},saved.personal,'3-60').length,0);
 }
});
test('older personal events and invalid colour values safely default to purple',async()=>{
 const {personalColor}=await import('../lib/event-colors.ts');
 assert.equal(personalColor(undefined),'purple');assert.equal(personalColor('orange'),'purple');assert.equal(personalColor(null),'purple');
});


test('compact week fits its viewport and preserves long days, short events and proportional free time',async()=>{
 const {timetableScale}=await import('../lib/timetable-layout.ts');
 const {minutes}=await import('../lib/ferit.ts');
 const event={id:'test',scheduleKey:'3-53',date:'2026-10-13',title:'Konzultacije',courseCode:'',start:'12:00',end:'13:00',room:'T2-14',type:'OSOBNO',typeLabel:'',teacher:'',group:'',progress:''};
 const early={...event,start:'07:30',end:'10:30'};const late={...event,start:'20:00',end:'21:45'};
 const week=timetableScale([event,early,late],true,240);
 assert.equal(week.start,420);assert.equal(week.end,1320);assert.equal(week.hour,16);assert.equal(week.height,240);
 assert.equal((minutes(event.end)-minutes(event.start))/60*week.hour,16);
 assert.equal((minutes(event.start)-minutes(early.end))/60*week.hour,24);
 assert.equal(timetableScale([event],false).hour,72);
});

test('week range includes classes outside the baseline and scales them without clipping',async()=>{
 const {timetableScale}=await import('../lib/timetable-layout.ts');
 const event={id:'late',scheduleKey:'3-53',date:'2026-10-13',title:'Kasni termin',courseCode:'',start:'22:15',end:'23:45',room:'T2-14',type:'OSOBNO',typeLabel:'',teacher:'',group:'',progress:''};
 const week=timetableScale([event,{...event,id:'early',start:'06:45',end:'07:00'}],true,288);
 assert.equal(week.start,360);assert.equal(week.end,1440);assert.equal(week.hour,16);assert.equal(week.height,288);
 const lastBottom=(23.75*60-week.start)/60*week.hour;
 assert.equal(lastBottom,284);assert.ok(lastBottom<week.height);
});

test('empty compact week keeps the full baseline and invalid viewport measurements use a stable fallback',async()=>{
 const {timetableScale}=await import('../lib/timetable-layout.ts');
 assert.deepEqual(timetableScale([],true,258),{start:480,end:1320,hour:258/14,height:258});
 assert.equal(timetableScale([],true,228).hour,228/14);
 for(const invalid of [undefined,0,-1,NaN,Infinity])assert.equal(timetableScale([],true,invalid).height,258);
 assert.deepEqual(timetableScale([],false,228),{start:480,end:1080,hour:72,height:720});
});


test('a brief late overlap does not squeeze the whole earlier class, while real parallel classes keep separate lanes',async()=>{
 const {lessonLanes}=await import('../lib/timetable-layout.ts');
 const base={id:'lecture',scheduleKey:'3-60',date:'2026-10-12',title:'Arhitektura računala',courseCode:'',start:'08:00',end:'11:15',room:'K2-12',type:'PR',typeLabel:'',teacher:'',group:'',progress:''};
 const short={...base,id:'personal',start:'11:00',end:'11:30',personal:true};
 let slots=lessonLanes([base,short]);assert.deepEqual(slots.get('lecture'),{lane:0,count:2,span:2});assert.deepEqual(slots.get('personal'),{lane:1,count:2,span:1});
 slots=lessonLanes([base,{...short,start:'08:00',end:'09:00'}]);assert.equal(slots.get('lecture')!.span,1);
 slots=lessonLanes([base,{...short,start:'10:00',end:'13:00'}]);assert.equal(slots.get('lecture')!.span,1);
 slots=lessonLanes([base,{...short,start:'11:15',end:'11:30'}]);assert.equal(slots.get('lecture')!.count,1);
});

test('compact week keeps even brief overlapping classes in separate lanes',async()=>{
 const {lessonLanes}=await import('../lib/timetable-layout.ts');
 const base={id:'lecture',scheduleKey:'3-60',date:'2026-10-12',title:'Arhitektura računala',courseCode:'',start:'08:00',end:'11:15',room:'K2-12',type:'PR',typeLabel:'',teacher:'',group:'',progress:''};
 const short={...base,id:'personal',start:'11:00',end:'11:30',personal:true};
 const next={...base,id:'next',start:'11:30',end:'12:30'};
 const slots=lessonLanes([next,short,base],true);
 assert.deepEqual(slots.get('lecture'),{lane:0,count:2,span:1});
 assert.deepEqual(slots.get('personal'),{lane:1,count:2,span:1});
 assert.deepEqual(slots.get('next'),{lane:0,count:1,span:1});
});
