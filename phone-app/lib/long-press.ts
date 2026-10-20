type Point = {x:number;y:number;pointerId:number};
type Clock = {set:(callback:()=>void,delay:number)=>unknown;clear:(timer:unknown)=>void};
const clock:Clock={set:(callback,delay)=>setTimeout(callback,delay),clear:timer=>clearTimeout(timer as ReturnType<typeof setTimeout>)};

// Movement and browser pointer cancellation must release the timer so scrolling
// and day swipes never open the editor later.
export function createLongPress(onHold:()=>void,timers:Clock=clock){
 let start:Point|null=null;let timer:unknown=null;let suppressTap=false;
 const finish=(pointerId?:number)=>{
  if(!start||(pointerId!==undefined&&start.pointerId!==pointerId))return false;
  if(timer!==null)timers.clear(timer);
  timer=null;start=null;
  return true;
 };
 const cancel=(pointerId?:number)=>{
  // Touch browsers may send pointerleave after pointerup, before click. A
  // completed release is no longer an active press and must remain a valid tap.
  if(finish(pointerId))suppressTap=true;
 };
 return {
  start(point:Point){cancel();suppressTap=false;start=point;timer=timers.set(()=>{timer=null;start=null;suppressTap=true;onHold();},550);},
  move(point:Point){if(start?.pointerId===point.pointerId&&Math.hypot(point.x-start.x,point.y-start.y)>10)cancel(point.pointerId);},
  release(pointerId:number){finish(pointerId);},
  consumeTap(){const allowed=!suppressTap;suppressTap=false;return allowed;},
  cancel,
 };
}
