import {minutes,type Lesson} from './ferit.ts';

// The week fits its available viewport while preserving relative durations and gaps.
// The day retains its readable, scrollable scale.
export function timetableScale(lessons:Lesson[],week:boolean,availableGridHeight?:number){
 const first=lessons.length?Math.min(...lessons.map(l=>Math.floor(minutes(l.start)/60)*60)):480;
 const start=week?Math.min(480,first):first;
 const end=week?Math.max(1320,...lessons.map(l=>Math.ceil(minutes(l.end)/60)*60)):
  lessons.length?Math.max(start+240,...lessons.map(l=>(Math.ceil(minutes(l.end)/60)+1)*60)):1080;
 const weekHeight=typeof availableGridHeight==='number'&&Number.isFinite(availableGridHeight)&&availableGridHeight>0?availableGridHeight:258;
 const hour=week?weekHeight/((end-start)/60):72;
 return {start,end,hour,height:week?weekHeight:(end-start)/60*hour};
}

export type FreeTimeInterval={start:number;end:number;duration:number};

// Pass the visible lessons for one day. A break starts only after every
// overlapping class has finished, and ends when the next class begins.
export function freeTimeIntervals(lessons:Lesson[],minimumMinutes=30):FreeTimeInterval[]{
 const occupied=lessons.map(l=>({start:minutes(l.start),end:minutes(l.end)}))
  .filter(l=>Number.isFinite(l.start)&&Number.isFinite(l.end)&&l.start>=0&&l.end<=1440&&l.end>l.start)
  .sort((a,b)=>a.start-b.start||b.end-a.end);
 if(!occupied.length)return [];
 const minimum=Number.isFinite(minimumMinutes)?Math.max(30,minimumMinutes):30;
 const gaps:FreeTimeInterval[]=[];let until=occupied[0].end;
 for(const interval of occupied.slice(1)){
  if(interval.start>until&&interval.start-until>=minimum)gaps.push({start:until,end:interval.start,duration:interval.start-until});
  until=Math.max(until,interval.end);
 }
 return gaps;
}

export function lessonLanes(lessons:Lesson[],compact=false){
 const slots=new Map<string,{lane:number,count:number,span:number}>();let cluster:Lesson[]=[];let until=0;
 const finish=()=>{
  const ends:number[]=[];
  for(const l of cluster){let lane=ends.findIndex(end=>end<=minutes(l.start));if(lane<0)lane=ends.length;ends[lane]=minutes(l.end);slots.set(l.id,{lane,count:0,span:1});}
  for(const l of cluster){
   const slot=slots.get(l.id)!;slot.count=ends.length;
   for(let next=slot.lane+1;next<slot.count;next++){
    const overlaps=cluster.filter(other=>slots.get(other.id)!.lane===next&&minutes(other.start)<minutes(l.end)&&minutes(other.end)>minutes(l.start));
    // A late overlap of at most 30 minutes can sit over the empty lower part of
    // the earlier card. Keep simultaneous or substantial overlaps in separate lanes.
    if((compact&&overlaps.length>0)||overlaps.some(other=>minutes(other.start)-minutes(l.start)<150||Math.min(minutes(other.end),minutes(l.end))-minutes(other.start)>30))break;
    slot.span++;
   }
  }
 };
 for(const l of [...lessons].sort((a,b)=>minutes(a.start)-minutes(b.start))){if(cluster.length&&minutes(l.start)>=until){finish();cluster=[];until=0;}cluster.push(l);until=Math.max(until,minutes(l.end));}
 finish();return slots;
}
