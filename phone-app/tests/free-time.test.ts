import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Lesson} from '../lib/ferit.ts';
import {freeTimeIntervals} from '../lib/timetable-layout.ts';

function lesson(id:string,start:string,end:string):Lesson{
 return {id,scheduleKey:'3-53',date:'2026-10-14',title:id,courseCode:'',start,end,room:'K3-12',type:'LV',typeLabel:'',teacher:'',group:'SR-LV3',progress:''};
}

test('free time is measured between the end of all parallel classes and the next start',()=>{
 const classes=[lesson('next','14:00','15:00'),lesson('early','08:00','11:00'),lesson('overlap','10:00','13:00'),lesson('nested','10:30','11:15'),lesson('duplicate','08:00','11:00')];
 const order=classes.map(l=>l.id);
 assert.deepEqual(freeTimeIntervals(classes),[{start:780,end:840,duration:60}]);
 assert.deepEqual(classes.map(l=>l.id),order);
});

test('adjacent and chained overlaps leave no artificial breaks, and gaps under 30 minutes stay unlabeled',()=>{
 const classes=[lesson('a','08:00','09:00'),lesson('b','09:00','10:00'),lesson('c','09:30','11:00'),lesson('d','11:15','12:00'),lesson('e','12:30','13:00'),lesson('f','13:45','14:00')];
 assert.deepEqual(freeTimeIntervals(classes),[{start:720,end:750,duration:30},{start:780,end:825,duration:45}]);
 assert.deepEqual(freeTimeIntervals(classes,60),[]);
 assert.deepEqual(freeTimeIntervals(classes,5),freeTimeIntervals(classes));
});

test('empty, single-class and invalid ranges do not create before-class or after-class free time',()=>{
 assert.deepEqual(freeTimeIntervals([]),[]);
 assert.deepEqual(freeTimeIntervals([lesson('only','12:00','13:00')]),[]);
 const classes=[lesson('a','08:00','09:00'),lesson('bad','not-time','10:00'),lesson('zero','09:15','09:15'),lesson('reversed','10:30','10:00'),lesson('out-of-day','25:00','26:00'),lesson('b','10:00','11:00')];
 assert.deepEqual(freeTimeIntervals(classes),[{start:540,end:600,duration:60}]);
});
