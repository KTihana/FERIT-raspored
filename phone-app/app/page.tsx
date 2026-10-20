'use client';
import {useEffect,useRef,useState,useMemo,useCallback,useId,type ReactNode,type FormEvent,type CSSProperties,type RefObject} from 'react';
import {ChevronDown,ChevronLeft,ChevronRight,Check,Plus,X,SlidersHorizontal,Menu,RefreshCw,Download,RotateCcw,Trash2,Sun,Moon,Search,Keyboard,ChevronsUpDown} from 'lucide-react';
import {addDays,monday,dateToday,minutes,courseGroupKey,filterCourseGroups,studyChoices,mergeLabCourses,swipeDirection,type LabCourse,type Study,type Lesson,type Schedule,type Override} from '../lib/ferit';
import {scheduleClient,isPhoneApp,phoneOrientation,onPhoneResume,phoneTheme,readPhonePreferences,savePhonePreferences,phonePreferenceKeys,supportsHomeWidget,addHomeWidget} from '../lib/phone-runtime';
import backup from '../lib/catalogue-backup.json';
import {createLongPress} from '../lib/long-press';
import {storedTheme,type Theme} from '../lib/theme';
import {PERSONAL_COLORS,personalColor} from '../lib/event-colors';
import {timetableScale,lessonLanes,freeTimeIntervals} from '../lib/timetable-layout';
import {useAppUpdates} from '../lib/use-app-updates';
import {resetPersonalSchedule} from '../lib/reset-schedule';
import {createOfflineScheduleLoader,ScheduleUnavailableError,teachingWeekLabel,type SavedWeek} from '../lib/offline-schedule';
import {normalizeTimeEntry,stepTimePart} from '../lib/time-entry';
import {lessonTags,lessonTypeLabel,assessmentFilters,filterAssessments,upcomingAssessments,type AssessmentFilterId} from '../lib/assessments';
import {readUpcomingWeeks,assessmentCountdown,assessmentWeekRange,type UpcomingSnapshot} from '../lib/upcoming-assessments';
import {LaunchScreen} from '../mobile/launch-screen';
import {EMPTY_REPEATING,repeatingYearOptions,repeatingCourseId,mergeRepeatingCourses,activeRepeatingCourses,combinedPersonalSchedule,type RepeatingCourse,type RepeatingSettings} from '../lib/repeating-courses';
type Selection={study:string,key:string};
type Preferences={theme:Theme;selection:Selection|null;groups:Record<string,string>;overrides:Record<string,Override>;personal:Lesson[];repeating:Record<string,RepeatingSettings>};
const EMPTY:Preferences={theme:'light',selection:null,groups:{},overrides:{},personal:[],repeating:{}};
const STORAGE='ferit-personal-v1';
const savedSchedules=createOfflineScheduleLoader(scheduleClient.schedule,{get:readPhonePreferences,set:savePhonePreferences,keys:phonePreferenceKeys});
const fallback:Study[]=backup.programmes.map(p=>({name:p.name,options:p.options.map(o=>({label:o.label,key:`${o.year}-${o.scheduleId}`,year:o.year??1,code:o.label.replace(/\b\d+\s*\.\s*g\./,'').replace(/\([^)]*\)/g,'').trim(),exam:o.label.includes('ispiti'),legacy:o.legacy}))}));
const fmt=(date:string,options:Intl.DateTimeFormatOptions)=>{const label=new Intl.DateTimeFormat('hr-HR',options).format(new Date(date+'T12:00:00Z'));return label.charAt(0).toLocaleUpperCase('hr')+label.slice(1);};
const courseKey=courseGroupKey;
const personalId=()=>globalThis.crypto?.randomUUID?.()??`personal-${Date.now()}-${Math.random()}`;
function Modal({title,children,onClose,actions,variant='sheet',style,actionsClassName=''}:{title:string;children:ReactNode;onClose:()=>void;actions?:ReactNode;variant?:'sheet'|'calendar'|'confirmation'|'time';style?:CSSProperties;actionsClassName?:string}){
 const ref=useRef<HTMLDialogElement>(null);const titleId=useId();
 useEffect(()=>{const dialog=ref.current;if(!dialog?.open)dialog?.showModal();return()=>dialog?.close();},[]);
 return <dialog ref={ref} className={variant==='calendar'?'app-dialog date-picker-dialog':variant==='confirmation'?'app-dialog reset-dialog':variant==='time'?'app-dialog time-picker-dialog':'app-dialog modal-full'} style={style} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();e.stopPropagation();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div className="modal-content">
   {variant==='calendar'?<h2 id={titleId} className="sr-only">{title}</h2>:<div className="modal-title"><h2 id={titleId}>{title}</h2><button type="button" className="icon" onClick={onClose} aria-label="Zatvori"><X size={20}/></button></div>}
   <div className="modal-body">{children}</div>
   {actions&&<div className={'modal-actions '+actionsClassName}>{actions}</div>}
  </div>
 </dialog>;
}
function CalendarPicker({date,onChoose,onClose,actionLabel='Prikaži'}:{date:string;onChoose:(d:string)=>void;onClose:()=>void;actionLabel?:string}){
 const [month,setMonth]=useState(date.slice(0,7)+'-01');const [pick,setPick]=useState(date);
 const gesture=useRef<{x:number;y:number;pointerId:number;moved:boolean}|null>(null);const suppressPick=useRef(false);
 const today=dateToday();const first=new Date(month+'T12:00:00Z');const offset=(first.getUTCDay()+6)%7;const monthDays=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 const start=monday(month);const days=Array.from({length:Math.ceil((offset+monthDays)/7)*7},(_,i)=>addDays(start,i));
 const step=(n:number)=>setMonth(current=>{const d=new Date(current+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,10);});
 return <Modal title="Odaberi datum" variant="calendar" onClose={onClose} actionsClassName="date-picker-footer" actions={<><time dateTime={pick}>{fmt(pick,{weekday:'short',day:'numeric',month:'long'})}</time><button type="button" className="primary" onClick={()=>{onChoose(pick);onClose();}}>{actionLabel}</button></>}>
  <div className="month-nav"><strong aria-live="polite">{fmt(month,{month:'long',year:'numeric'})}</strong><div><button type="button" className="icon" onClick={()=>step(-1)} aria-label="Prethodni mjesec"><ChevronLeft size={20}/></button><button type="button" className="icon" onClick={()=>step(1)} aria-label="Sljedeći mjesec"><ChevronRight size={20}/></button><button type="button" className="icon" onClick={onClose} aria-label="Zatvori kalendar"><X size={18}/></button></div></div>
  <div className="calendar"
   onPointerDownCapture={e=>{if(e.button===0){suppressPick.current=false;gesture.current={x:e.clientX,y:e.clientY,pointerId:e.pointerId,moved:false};}}}
   onPointerMove={e=>{const from=gesture.current;if(!from||from.pointerId!==e.pointerId)return;const x=e.clientX-from.x,y=e.clientY-from.y;if(Math.hypot(x,y)>10)from.moved=true;if(Math.abs(x)>10&&Math.abs(x)>Math.abs(y)*1.5&&!e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.setPointerCapture(e.pointerId);}}
   onPointerCancel={()=>{gesture.current=null;suppressPick.current=true;}}
   onPointerUp={e=>{const from=gesture.current;if(!from||from.pointerId!==e.pointerId)return;const direction=swipeDirection(e.clientX-from.x,e.clientY-from.y);suppressPick.current=from.moved||!!direction;gesture.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(direction)step(direction);}}
   onClickCapture={e=>{if(e.detail!==0&&suppressPick.current){e.preventDefault();e.stopPropagation();}}}>
   {['P','U','S','Č','P','S','N'].map((d,i)=><span className="weekday" key={i}>{d}</span>)}{days.map(d=><button type="button" key={d} aria-label={fmt(d,{dateStyle:'full'})} aria-pressed={d===pick} className={['calendar-date',d===pick?'chosen':'',d===today?'today':'',d.slice(0,7)!==month.slice(0,7)?'other-month':''].join(' ')} onClick={()=>setPick(d)}>{Number(d.slice(-2))}{d===today&&<i/>}</button>)}
  </div>
 </Modal>;
}
function StudyPickerSurface({inline,title,children,onClose,actions}:{inline:boolean;title:string;children:ReactNode;onClose:()=>void;actions?:ReactNode}){
 if(inline)return <section className="initial-picker"><h1>Odaberi raspored</h1><div className="picker-body">{children}</div>{actions&&<div className="picker-actions">{actions}</div>}</section>;
 return <Modal title={title} onClose={onClose} actions={actions} actionsClassName="picker-actions">{children}</Modal>;
}
function StudyPicker({studies,selection,onSave,onClose,inline=false}:{studies:Study[];selection:Selection|null;onSave:(s:Selection)=>void;onClose:()=>void;inline?:boolean}){
 const choices=studyChoices(studies,selection?.key);
 const [search,setSearch]=useState('');const [studyId,setStudyId]=useState<string|null>(null);const [pending,setPending]=useState<Selection|null>(selection);
 const query=search.trim().toLocaleLowerCase('hr');const focused=choices.find(c=>c.id===studyId);
 const matches=choices.filter(c=>c.label.toLocaleLowerCase('hr').includes(query)||c.options.some(o=>o.label.toLocaleLowerCase('hr').includes(query)));
 const option=focused?.options.find(o=>o.key===pending?.key);
 const chooseStudy=(id:string)=>{const choice=choices.find(c=>c.id===id);if(!choice)return;setStudyId(id);setPending(choice.options.some(o=>o.key===selection?.key)?selection:choice.options.length===1?{study:choice.study,key:choice.options[0].key}:null);};
 return <StudyPickerSurface inline={inline} title={focused?'Godina':'Odaberi raspored'} onClose={onClose} actions={focused?<button className="primary full" disabled={!option} onClick={()=>{if(!pending||!option)return;onSave(pending);onClose();}}>Prikaži raspored</button>:undefined}>
  {focused?<div className="study-selection">
   <button type="button" className="picker-back" onClick={()=>setStudyId(null)}><ChevronLeft size={18}/>Svi studiji</button>
   <h2 className="programme-heading">{focused.label}</h2>
   <fieldset className="selection-field"><legend>Godina</legend><div className="selection-options">{focused.options.map(o=><button type="button" key={o.key} aria-label={focused.study+' · '+o.label} aria-pressed={pending?.key===o.key} className={pending?.key===o.key?'selected':''} onClick={()=>setPending({study:focused.study,key:o.key})}><span>{o.label}</span>{pending?.key===o.key&&<Check size={16}/>}</button>)}</div></fieldset>
   {option&&<p className="picker-summary"><span>Odabrani raspored</span><strong>{focused.study} · {option.label}</strong></p>}
  </div>:<>
   <div className="search-wrap"><Search size={18} aria-hidden="true"/><input className="search" aria-label="Pretraži studij ili smjer" placeholder="Pretraži studij ili smjer" value={search} onChange={e=>setSearch(e.target.value)}/></div>
   <div className="study-list">{matches.map(c=><button type="button" className="study-directory-row" key={c.id} aria-label={c.study} onClick={()=>chooseStudy(c.id)}><span><strong>{c.label}</strong>{c.options.some(o=>o.key===selection?.key)&&<small>{c.options.find(o=>o.key===selection?.key)?.label} · odabrano</small>}</span><ChevronRight size={18}/></button>)}{!matches.length&&<p className="hint">Nema rezultata za taj studij.</p>}</div>
   <p className="study-count">{matches.length} {query?'rezultata':'studija i kategorija'}</p>
  </>}
 </StudyPickerSurface>;
}
function GroupPicker({courses,groups,loading,error,study,onSave,onClose}:{courses:LabCourse[];groups:Record<string,string>;loading:boolean;error:string;study:string;onSave:(g:Record<string,string>)=>void;onClose:()=>void}){
 const [values,setValues]=useState(groups);
 return <Modal title="LV grupe" onClose={onClose} actions={<button className="primary full" disabled={loading&&!courses.length} onClick={()=>{onSave(values);onClose();}}>Spremi grupe</button>}>
  <p className="group-context">{study}</p>
  <p className="hint group-hint">Grupa se bira zasebno za svaki predmet.</p>
  {loading&&<p className="hint group-status" role="status">Provjeravam dostupne grupe…</p>}{error&&<p className="hint group-status" role="status">{error}</p>}
  {!loading&&courses.length===0&&<p className="hint group-status">U objavljenim terminima nema LV grupa za ovaj raspored.</p>}
  {courses.map(c=>{const selected=values[c.id]??'';const options=[...new Set([...c.groups,...(selected?[selected]:[])])].sort((a,b)=>a.localeCompare(b,'hr',{numeric:true}));return <fieldset className="group-field" key={c.id}><legend><strong>{c.title}</strong><small>{c.courseCode} · laboratorijske vježbe</small></legend><div className="group-options"><button type="button" aria-pressed={!selected} className={!selected?'selected':''} onClick={()=>setValues({...values,[c.id]:''})}>Sve grupe</button>{options.map(g=><button type="button" key={g} aria-label={c.title+' · '+g} aria-pressed={selected===g} className={selected===g?'selected':''} onClick={()=>setValues({...values,[c.id]:g})}>{g}{selected===g&&<Check size={14}/>}</button>)}</div></fieldset>;})}
 </Modal>;
}
function RepeatingPicker({studies,scheduleKey,settings,week,onSave,onClose}:{studies:Study[];scheduleKey:string;settings:RepeatingSettings;week:string;onSave:(settings:RepeatingSettings)=>void;onClose:()=>void}){
 const options=repeatingYearOptions(studies,scheduleKey);
 const [values,setValues]=useState<RepeatingSettings>({courses:settings.enabled===false?[]:settings.courses});const [sourceKey,setSourceKey]=useState(options[0]?.key??'');
 const [courses,setCourses]=useState<RepeatingCourse[]>(settings.courses);const [loading,setLoading]=useState(false);const [message,setMessage]=useState('');const [refresh,setRefresh]=useState(0);const [search,setSearch]=useState('');
 useEffect(()=>{
  if(!sourceKey)return;
  const controller=new AbortController();setLoading(true);setMessage('');
  const storageKey='ferit-repeating-courses:'+sourceKey;
  async function discover(){
   let known:RepeatingCourse[]=[];
   try{const saved=JSON.parse(await readPhonePreferences(storageKey)??'[]');if(Array.isArray(saved))known=saved.filter(c=>c?.scheduleKey===sourceKey&&typeof c.title==='string'&&typeof c.courseCode==='string');}catch{}
   if(controller.signal.aborted)return;
   setCourses(current=>mergeRepeatingCourses([...current,...known],[]));
   // Check the published semester, including the immediately preceding two weeks.
   const snapshot=await readUpcomingWeeks(sourceKey,addDays(week,-14),async(key,date,signal)=>{
    const result=await savedSchedules.load(key,date,{signal,allowLastSaved:false});return {schedule:result.snapshot.schedule,offline:result.offline};
   },{signal:controller.signal,onProgress:snapshot=>{
    known=mergeRepeatingCourses(known,snapshot.weeks.flatMap(w=>w.schedule.lessons));
    setCourses(current=>mergeRepeatingCourses([...current,...known],[]));
   }});
   controller.signal.throwIfAborted();
   await savePhonePreferences(storageKey,JSON.stringify(known)).catch(()=>{});
   if(snapshot.unavailable.length||snapshot.inPreparation.length||snapshot.weeks.some(w=>w.offline))setMessage('Popis sadrži predmete iz dostupnih i spremljenih tjedana. Dio rasporeda još nije objavljen ili ga nije moguće provjeriti.');
  }
  void discover().catch(()=>{if(!controller.signal.aborted)setMessage('Predmete trenutačno nije moguće provjeriti. Spremljeni odabiri ostaju dostupni.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[sourceKey,week,refresh]);
 const toggleCourse=(course:RepeatingCourse)=>setValues(current=>({...current,courses:current.courses.some(c=>repeatingCourseId(c)===repeatingCourseId(course))?current.courses.filter(c=>repeatingCourseId(c)!==repeatingCourseId(course)):[...current.courses,{...course,selectedTypes:course.types?.map(type=>type.id)}]}));
 const toggleType=(course:RepeatingCourse,typeId:string)=>setValues(current=>({...current,courses:current.courses.flatMap(saved=>{
  if(repeatingCourseId(saved)!==repeatingCourseId(course))return [saved];
  const types=saved.selectedTypes??course.types?.map(type=>type.id)??[];
  const selectedTypes=types.includes(typeId)?types.filter(id=>id!==typeId):[...types,typeId];
  return selectedTypes.length?[{...saved,types:course.types,selectedTypes}]:[];
 })}));
 const shown=courses.filter(c=>c.scheduleKey===sourceKey&&c.title.toLocaleLowerCase('hr').includes(search.trim().toLocaleLowerCase('hr')));
 const selected=values.courses.filter(c=>options.some(o=>o.key===c.scheduleKey));
 return <Modal title="Ponavljački predmeti" onClose={onClose} actions={<button type="button" className="primary full" onClick={()=>{onSave({courses:selected});onClose();}}>Spremi odabir{selected.length>0?` (${selected.length})`:''}</button>}>
  <p className="hint">Odaberi predmete koje ponovno slušaš uz svoju godinu. Dostupni su samo predmeti s godine neposredno ispod tvoje. Za svaki predmet odaberi vrste nastave koje želiš vidjeti.</p>
  {!options.length?<p className="hint repeating-status">Za odabrani raspored nema prethodne godine studija.</p>:<>
    <fieldset className="selection-field repeating-year"><legend>{options[0].year}. godina · {studies.find(s=>s.options.some(o=>o.key===scheduleKey))?.name}</legend>{options.length>1&&<div className="selection-options">{options.map(o=><button type="button" key={o.key} aria-pressed={sourceKey===o.key} className={sourceKey===o.key?'selected':''} onClick={()=>{setSourceKey(o.key);setSearch('');}}>{o.label}{sourceKey===o.key&&<Check size={16}/>}</button>)}</div>}</fieldset>
    <div className="search-wrap"><Search size={18} aria-hidden="true"/><input className="search" aria-label="Pretraži ponavljačke predmete" placeholder="Pretraži predmete" value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <div className="repeating-toolbar"><span>{selected.length} odabrano</span><button type="button" className="icon" aria-label="Osvježi ponavljačke predmete" disabled={loading} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={16} className={loading?'spin':''}/></button></div>
    {loading&&<p className="hint repeating-status" role="status">Tražim predmete u objavljenim tjednima…</p>}
    {message&&<p className="hint repeating-status" role="status">{message}</p>}
    <div className="repeating-list">{shown.map(course=>{
     const saved=selected.find(c=>repeatingCourseId(c)===repeatingCourseId(course));const types=course.types??[];
     return <section className="repeating-subject" key={repeatingCourseId(course)}>
      <label className="repeating-course"><input type="checkbox" aria-label={course.title} checked={!!saved} disabled={!saved&&!types.length} onChange={()=>toggleCourse(course)}/><span><strong>{course.title}</strong><small>{course.courseCode}</small></span></label>
      {saved&&types.length>0&&<fieldset className="repeating-types"><legend>Vrste nastave · {course.title}</legend>{types.map(type=><label key={type.id}><input type="checkbox" aria-label={course.title+' · '+type.label} checked={!saved.selectedTypes||saved.selectedTypes.includes(type.id)} onChange={()=>toggleType(course,type.id)}/><span>{type.label}</span></label>)}</fieldset>}
      {!types.length&&<p className="hint repeating-type-status">Vrste nastave još nisu dostupne. Potrebni su objavljeni ili spremljeni termini.</p>}
     </section>;
    })}</div>
    {!loading&&!shown.length&&<p className="hint repeating-status">{search?'Nema predmeta za taj pojam.':'U dostupnim tjednima nema pronađenih predmeta. Pokušaj osvježiti kada FERIT objavi raspored.'}</p>}
    <p className="hint repeating-status">Prikazane su samo vrste nastave pronađene u dostupnim terminima. Ako odabereš LV, svoju grupu postavi u Postavke → LV grupe.</p>
  </>}
 </Modal>;
}
function TimeWheel({label,part,value,onChange,onType,onBlur,inputRef,keyboardMode=false,onEnter}:{label:string;part:'hour'|'minute';value:string;onChange:(value:string)=>void;onType:(value:string)=>void;onBlur:()=>void;inputRef?:RefObject<HTMLInputElement|null>;keyboardMode?:boolean;onEnter?:()=>void}){
 const ref=useRef<HTMLDivElement>(null);const latest=useRef({value,onChange});latest.current={value,onChange};
 const drag=useRef<{x:number;y:number;lastY:number;currentY:number;id:number;moved:boolean}|null>(null);const suppressClick=useRef(false);
 const adjust=useCallback((delta:number)=>{const next=stepTimePart(latest.current.value,part,delta);latest.current.value=next;latest.current.onChange(next);},[part]);
 useEffect(()=>{const node=ref.current;if(!node||keyboardMode)return;let accumulated=0;const wheel=(event:WheelEvent)=>{event.preventDefault();accumulated+=event.deltaY*(event.deltaMode===1?24:event.deltaMode===2?96:1);const steps=Math.trunc(accumulated/36);if(steps){accumulated-=steps*36;adjust(steps);}};node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);},[adjust,keyboardMode]);
 const index=part==='hour'?0:1;const current=value.split(':')[index]??'';
 const finish=(pointerId:number,snap=true)=>{const from=drag.current;if(!from||from.id!==pointerId)return;if(snap&&from.moved){const remainder=Math.round((from.lastY-from.currentY)/24);if(remainder)adjust(remainder);}suppressClick.current=from.moved;drag.current=null;if(ref.current?.hasPointerCapture(pointerId))ref.current.releasePointerCapture(pointerId);};
 return <div ref={ref} className="time-wheel"
  onPointerDown={e=>{if(e.button===0&&!keyboardMode){if(e.target instanceof HTMLInputElement)e.preventDefault();suppressClick.current=false;drag.current={x:e.clientX,y:e.clientY,lastY:e.clientY,currentY:e.clientY,id:e.pointerId,moved:false};}}}
  onPointerMove={e=>{const from=drag.current;if(!from||from.id!==e.pointerId)return;from.currentY=e.clientY;if(!from.moved&&Math.abs(e.clientY-from.y)>8&&Math.abs(e.clientY-from.y)>Math.abs(e.clientX-from.x)){from.moved=true;e.currentTarget.setPointerCapture(e.pointerId);}if(!from.moved)return;e.preventDefault();const steps=Math.trunc((from.lastY-e.clientY)/24);if(steps){from.lastY-=steps*24;adjust(steps);}}}
  onPointerUp={e=>finish(e.pointerId)} onPointerCancel={e=>{finish(e.pointerId,false);suppressClick.current=true;}} onPointerLeave={()=>{if(drag.current&&!drag.current.moved)drag.current=null;}}
  onClickCapture={e=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();suppressClick.current=false;}}}>
  <button className="wheel-neighbour" type="button" tabIndex={-1} aria-label={label+(part==='hour'?' — prethodni sat':' — prethodna minuta')} onClick={()=>adjust(-1)}>{stepTimePart(value,part,-1).split(':')[index]}</button>
  <input ref={inputRef} required type="text" inputMode="numeric" enterKeyHint={part==='hour'?'next':'done'} autoComplete="off" maxLength={2} pattern="[0-9]{1,2}" role="spinbutton" aria-valuemin={0} aria-valuemax={part==='hour'?23:59} aria-valuenow={current&&Number(current)<=(part==='hour'?23:59)?Number(current):undefined} aria-label={label+(part==='hour'?' — sati':' — minute')} placeholder={part==='hour'?'hh':'mm'} value={current} onFocus={e=>e.currentTarget.select()} onChange={e=>onType(e.target.value)} onBlur={onBlur} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onEnter?.();}else if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();adjust(e.key==='ArrowUp'?1:-1);}}}/>
  <button className="wheel-neighbour" type="button" tabIndex={-1} aria-label={label+(part==='hour'?' — sljedeći sat':' — sljedeća minuta')} onClick={()=>adjust(1)}>{stepTimePart(value,part,1).split(':')[index]}</button>
 </div>;
}
function TimePicker({label,value,onApply,onClose}:{label:string;value:string;onApply:(value:string)=>void;onClose:()=>void}){
 const [draft,setDraft]=useState(value);const [keyboardMode,setKeyboardMode]=useState(false);const [error,setError]=useState('');const hourInput=useRef<HTMLInputElement>(null);const minuteInput=useRef<HTMLInputElement>(null);
 const [hour='',minute='']=draft.split(':');
 const update=(part:'hour'|'minute',text:string)=>{const digits=text.replace(/\D/g,'').slice(0,2);setError('');setDraft(part==='hour'?digits+':'+minute:hour+':'+digits);};
 const pad=(part:'hour'|'minute')=>{const text=part==='hour'?hour:minute;if(/^\d{1,2}$/.test(text)&&Number(text)<=(part==='hour'?23:59))update(part,text.padStart(2,'0'));};
 const close=()=>{hourInput.current?.blur();minuteInput.current?.blur();onClose();};
 const apply=()=>{const next=normalizeTimeEntry(draft);if(!next){setError('Unesi sate od 00 do 23 i minute od 00 do 59.');return;}hourInput.current?.blur();minuteInput.current?.blur();onApply(next);};
 return <Modal title={label} variant="time" onClose={close} actions={<button type="button" className="primary full" onClick={apply}>Primijeni</button>}>
  <div className={'time-picker-body '+(keyboardMode?'typing':'')}>
   <div className="time-picker-fields">
    <div className="time-picker-part"><span>Sati</span><TimeWheel label={label} part="hour" value={draft} onChange={v=>{setError('');setDraft(v);}} onType={v=>update('hour',v)} onBlur={()=>pad('hour')} inputRef={hourInput} keyboardMode={keyboardMode} onEnter={()=>{minuteInput.current?.focus();minuteInput.current?.select();}}/></div>
    <span className="time-picker-colon" aria-hidden="true">:</span>
    <div className="time-picker-part"><span>Minute</span><TimeWheel label={label} part="minute" value={draft} onChange={v=>{setError('');setDraft(v);}} onType={v=>update('minute',v)} onBlur={()=>pad('minute')} inputRef={minuteInput} keyboardMode={keyboardMode} onEnter={apply}/></div>
   </div>
   {error&&<p className="error-text" role="alert">{error}</p>}
   <button type="button" className="time-input-toggle" onClick={()=>{if(keyboardMode){hourInput.current?.blur();minuteInput.current?.blur();setKeyboardMode(false);}else{setKeyboardMode(true);hourInput.current?.focus();hourInput.current?.select();}}}>{keyboardMode?<ChevronsUpDown size={17}/>:<Keyboard size={17}/>}{keyboardMode?'Prikaži kotačiće':'Upiši vrijeme'}</button>
  </div>
 </Modal>;
}
function TimeEntry({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){
 const [picking,setPicking]=useState(false);
 return <fieldset className="time-entry"><legend>{label}</legend>
  <button type="button" className="time-entry-trigger" aria-label={label+' · '+value} aria-haspopup="dialog" aria-expanded={picking} onClick={()=>setPicking(true)}>{value}<ChevronDown size={16}/></button>
  {picking&&<TimePicker label={label} value={value} onApply={v=>{onChange(v);setPicking(false);}} onClose={()=>setPicking(false)}/>}
 </fieldset>;
}
function DateEntry({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const [picking,setPicking]=useState(false);
 return <fieldset className="date-entry"><legend>Datum</legend>
  <button type="button" className="date-entry-trigger" aria-label={'Datum · '+fmt(value,{dateStyle:'long'})} aria-haspopup="dialog" aria-expanded={picking} onClick={()=>setPicking(true)}><time dateTime={value}>{fmt(value,{dateStyle:'long'})}</time><ChevronDown size={16}/></button>
  {picking&&<CalendarPicker date={value} actionLabel="Odaberi" onChoose={onChange} onClose={()=>setPicking(false)}/>}
 </fieldset>;
}
function SourceTags({lesson}:{lesson:Lesson}){
 const tags=lessonTags(lesson);
 return tags.length?<span className="lesson-tags" title="Oznake iz FERIT rasporeda">{tags.map(tag=><span key={tag}>{tag}</span>)}</span>:null;
}
function LessonEditor({lesson,original,onSave,onDelete,onRestore,onClose}:{lesson:Lesson;original?:Lesson;onSave:(l:Lesson)=>void;onDelete:()=>void;onRestore?:()=>void;onClose:()=>void}){
 const [value,setValue]=useState(lesson);const [error,setError]=useState('');const [confirmDelete,setConfirmDelete]=useState(false);const formId=useId();const source=original??lesson;
 const set=(field:keyof Lesson,v:string)=>{setError('');setValue(current=>({...current,[field]:v}));};
 const submit=(e:FormEvent)=>{e.preventDefault();const start=normalizeTimeEntry(value.start),end=normalizeTimeEntry(value.end);if(!start||!end){setError('Unesi sate od 00 do 23 i minute od 00 do 59.');return;}if(!value.title.trim()||minutes(end)<=minutes(start)){setError('Unesi naziv i završetak nakon početka.');return;}onSave({...value,title:value.title.trim(),start,end,...(value.personal?{color:personalColor(value.color)}:{})});onClose();};
 const actions=<>{!lesson.personal&&<button type="button" className="text-action restore-action" onClick={()=>{if(onRestore){onRestore();onClose();}else{setValue({...source});setError('');}}}><RotateCcw size={15}/>Vrati izvorni termin</button>}{(!lesson.personal||lesson.title)&&<button type="button" className="text-action danger" onClick={()=>setConfirmDelete(true)}><Trash2 size={15}/>{lesson.personal?'Izbriši događaj':'Ukloni iz mog rasporeda'}</button>}<button type="submit" form={formId} className="primary full">Spremi {lesson.personal?'događaj':'izmjenu'}</button></>;
 return <><Modal title={lesson.personal?(lesson.title?'Uredi događaj':'Novi događaj'):'Uredi termin'} onClose={onClose} actions={actions} actionsClassName="editor-actions">
  {!lesson.personal&&<div className="editor-summary"><p className="editor-designation">Osobna izmjena</p><h3>{lesson.title}</h3><SourceTags lesson={lesson}/><div className="editor-summary-row"><span>{lessonTypeLabel(lesson,true)}{lesson.group&&' · '+lesson.group}</span><strong>{lesson.room||'Lokacija nije navedena'}</strong></div>{lesson.teacher&&<p>{lesson.teacher}</p>}<p className="lesson-meta">{lesson.courseCode}{lesson.progress&&' · '+lesson.progress}</p>{lesson.sourceChanged&&<p className="source-change-notice" role="status">FERIT je ažurirao termin. Osobna izmjena ostaje spremljena.</p>}</div>}
  <form id={formId} className="lesson-editor" onSubmit={submit}>
   {lesson.personal&&<label className="field-label">Naziv<input required value={value.title} onChange={e=>set('title',e.target.value)}/></label>}
   <DateEntry value={value.date} onChange={v=>set('date',v)}/>
   <div className="two-fields"><TimeEntry label="Početak" value={value.start} onChange={v=>set('start',v)}/><TimeEntry label="Kraj" value={value.end} onChange={v=>set('end',v)}/></div>
   {!lesson.personal&&<div className="source-comparison"><span>Izvorni FERIT termin</span><strong>{fmt(source.date,{day:'numeric',month:'numeric'})} · {source.start} – {source.end}{source.room&&' · '+source.room}</strong></div>}
   <label className="field-label">Lokacija<input value={value.room} onChange={e=>set('room',e.target.value)}/></label>
   {lesson.personal&&<fieldset className="color-field"><legend>Boja</legend><div className="color-options">{PERSONAL_COLORS.map(c=><button key={c.value} type="button" className={'color-option color-'+c.value+' '+(personalColor(value.color)===c.value?'selected':'')} aria-pressed={personalColor(value.color)===c.value} onClick={()=>set('color',c.value)}><span className="color-swatch">{personalColor(value.color)===c.value&&<Check size={17}/>}</span><span>{c.label}</span></button>)}</div></fieldset>}
   <label className="field-label">Napomena<textarea rows={2} value={value.note??''} onChange={e=>set('note',e.target.value)} placeholder={lesson.personal?'npr. konzultacije':'npr. profesor je promjenio vrijeme termina'}/></label>
   {lesson.personal&&<label className="assessment-opt-in"><input type="checkbox" checked={value.includeInAssessments===true} onChange={e=>setValue(current=>({...current,includeInAssessments:e.target.checked}))}/><span>Dodaj u Ispiti i provjere</span></label>}
   {error&&<p role="alert" className="error-text">{error}</p>}
  </form>
 </Modal>{confirmDelete&&<Modal title={lesson.personal?'Izbrisati događaj?':'Ukloniti termin?'} variant="confirmation" onClose={()=>setConfirmDelete(false)} actionsClassName="reset-actions" actions={<><button type="button" className="text-action" onClick={()=>setConfirmDelete(false)}>Odustani</button><button type="button" className="primary delete-confirm-button" onClick={()=>{onDelete();onClose();}}><Trash2 size={16}/>{lesson.personal?'Izbriši':'Ukloni'}</button></>}><p className="reset-explanation">Želiš li {lesson.personal?'izbrisati događaj':'ukloniti termin'} <strong>{lesson.title}</strong> iz svog rasporeda?</p></Modal>}</>;
}
function LessonDetails({lesson,rotated,onClose}:{lesson:Lesson;rotated:boolean;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);const titleId=useId();
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
 return <dialog ref={ref} className={'details-dialog '+(rotated?'rotated-details':'')} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();e.stopPropagation();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <section className="details-panel">
   <div className="details-heading"><span>Detalji termina</span><button className="icon" aria-label="Zatvori detalje" onClick={onClose}><X size={20}/></button></div>
   <div className="details-body">
    <h2 id={titleId}>{lesson.title}</h2>
    {lesson.repeatingYear&&<p className="hint">Ponavljački predmet · {lesson.repeatingYear}. godina</p>}
    <SourceTags lesson={lesson}/>
    <p className="details-date">{fmt(lesson.date,{weekday:'short',day:'numeric',month:'long'})}</p>
    <strong className="details-time">{lesson.start} – {lesson.end}</strong>
    <div className="details-facts"><div><span>Lokacija</span><strong>{lesson.room||'Lokacija nije navedena'}</strong></div>{!lesson.personal&&<div><span>Vrsta · grupa</span><strong className={'details-group '+(lesson.type==='LV'?'lab':lesson.type==='PR'?'lecture':'exercise')}>{lessonTypeLabel(lesson,true)+(lesson.group?' · '+lesson.group:'')}</strong></div>}</div>
    {lesson.teacher&&<p className="details-teacher">{lesson.teacher}</p>}
    {(lesson.courseCode||lesson.progress)&&<p className="lesson-meta">{lesson.courseCode}{lesson.progress&&' · '+lesson.progress}</p>}
    {lesson.note&&<p className="details-note">{lesson.note}</p>}
    {!lesson.personal&&<p className="details-source">{lesson.edited?'Osobna izmjena':'Izvorni FERIT termin'}</p>}
   </div>
  </section>
 </dialog>;
}
function LessonButton({lesson,onHold,onTap,className,style,children}:{lesson:Lesson;onHold:(lesson:Lesson)=>void;onTap?:(lesson:Lesson)=>void;className:string;style:CSSProperties;children:ReactNode}){
 const latest=useRef({lesson,onHold});latest.current={lesson,onHold};
 const [press]=useState(()=>createLongPress(()=>latest.current.onHold(latest.current.lesson)));
 useEffect(()=>()=>press.cancel(),[press]);
 return <button className={className} style={style} aria-label={`${[lesson.title,...lessonTags(lesson),...(!lesson.personal?[lessonTypeLabel(lesson,true)]:[])].join(', ')}, ${lesson.start} do ${lesson.end}, ${lesson.group}, ${lesson.room}.${lesson.personal&&lesson.note?' '+lesson.note+'.':''}${onTap?' Dodirni za detalje.':''} Drži za uređivanje.`}
  onPointerDown={e=>{if(e.button===0)press.start({x:e.clientX,y:e.clientY,pointerId:e.pointerId});}}
  onPointerMove={e=>press.move({x:e.clientX,y:e.clientY,pointerId:e.pointerId})}
  onPointerUp={e=>press.release(e.pointerId)} onPointerCancel={e=>press.cancel(e.pointerId)} onPointerLeave={e=>press.cancel(e.pointerId)}
  onClick={e=>{e.preventDefault();const pointerTap=e.detail!==0&&press.consumeTap();if(!pointerTap||onTap)e.stopPropagation();if(e.detail===0||pointerTap)onTap?.(lesson);}} onContextMenu={e=>e.preventDefault()}
  onKeyDown={e=>{if(!e.repeat&&(e.key==='Enter'||e.key===' ')){e.preventDefault();if(onTap&&!e.shiftKey)onTap(lesson);else onHold(lesson);}}}>{children}</button>;
}
function TimeGrid({date,lessons,week,rotated,onLesson,onDetails,onDay,onSwipe}:{date:string;lessons:Lesson[];week:boolean;rotated:boolean;onLesson:(l:Lesson)=>void;onDetails:(l:Lesson)=>void;onDay:(d:string)=>void;onSwipe:(direction:number)=>void}){
 const wrapper=useRef<HTMLDivElement>(null);const [gridHeight,setGridHeight]=useState(258);
 useEffect(()=>{if(!week||!wrapper.current)return;const node=wrapper.current;const resize=()=>setGridHeight(Math.max(40,node.clientHeight-28-8));resize();const observer=new ResizeObserver(resize);observer.observe(node);return()=>observer.disconnect();},[week,rotated]);
 const dates=week?Array.from({length:7},(_,i)=>addDays(monday(date),i)):[date];const visible=lessons.filter(l=>dates.includes(l.date));const {start,end,hour,height}=timetableScale(visible,week,gridHeight);
 const gesture=useRef<{x:number;y:number;pointerId:number;moved:boolean}|null>(null);const suppressTap=useRef(false);
 const holdLesson=useCallback((l:Lesson)=>{gesture.current=null;suppressTap.current=true;onLesson(l);},[onLesson]);
 return <div ref={wrapper} className={`grid-wrapper ${week?'weekly':''}`}
  onPointerDownCapture={e=>{if(e.button!==0)return;suppressTap.current=false;gesture.current={x:e.clientX,y:e.clientY,pointerId:e.pointerId,moved:false};}}
  onPointerMove={e=>{const from=gesture.current;if(from?.pointerId===e.pointerId&&Math.hypot(e.clientX-from.x,e.clientY-from.y)>10)from.moved=true;}}
  onPointerCancel={()=>{gesture.current=null;suppressTap.current=true;}}
  onPointerUp={e=>{const from=gesture.current;if(!from||from.pointerId!==e.pointerId)return;const direction=swipeDirection(e.clientX-from.x,e.clientY-from.y,rotated);suppressTap.current=from.moved||!!direction;if(direction)onSwipe(direction);gesture.current=null;}}
  onClick={e=>{if(week||e.detail===0||suppressTap.current)return;const control=(e.target as HTMLElement).closest('button,a,input,select,textarea,[role="button"]');if(control&&!control.classList.contains('lesson'))return;const rect=e.currentTarget.getBoundingClientRect();const edge=(e.clientX-rect.left)/rect.width;if(edge<.18)onSwipe(-1);else if(edge>.82)onSwipe(1);}}>
  {week&&<div className="week-head"><div/>{dates.map(d=><button key={d} onClick={()=>onDay(d)} className={d===dateToday()?'is-today':''}><span>{fmt(d,{weekday:'short'}).replace('.','')}</span><strong>{Number(d.slice(-2))}</strong></button>)}</div>}
  <div className="time-grid" style={{height}}><div className="time-axis">{Array.from({length:(end-start)/60+1},(_,i)=>i).filter(i=>!week||i%2===0||i===(end-start)/60).map(i=><span key={i} style={{top:i*hour}}>{String((start+i*60)/60).padStart(2,'0')}:00</span>)}</div>
   <div className="day-columns" style={{gridTemplateColumns:`repeat(${dates.length}, minmax(0,1fr))`}}>{dates.map(d=>{
    const events=visible.filter(l=>l.date===d);const lanes=lessonLanes(events,week);const breaks=week?[]:freeTimeIntervals(events);
    return <div key={d} className={`day-column ${week&&d===dateToday()?'today-column':''}`} style={{backgroundSize:`100% ${hour}px`}}>
     {!week&&breaks.map(b=><div className="break-label" key={b.start} style={{top:(b.start-start)/60*hour,height:b.duration/60*hour}}><span>{Math.floor(b.duration/60)>0?`${Math.floor(b.duration/60)} h `:''}{b.duration%60?`${b.duration%60} min `:''}slobodno</span></div>)}
     {events.map(l=>{const lane=lanes.get(l.id)!;const duration=minutes(l.end)-minutes(l.start);return <LessonButton key={l.id} lesson={l} onHold={holdLesson} onTap={week?onDetails:undefined} className={`lesson ${l.personal?`personal color-${personalColor(l.color)}`:l.type==='LV'?'lab':l.type==='PR'?'lecture':'exercise'} ${week?'compact':''} ${lessonTags(l).length?'has-tags':''} ${duration<=60?'short':''} ${duration<=30?'brief':''}`} style={{zIndex:lane.lane+1,top:(minutes(l.start)-start)/60*hour,height:duration/60*hour,paddingBlock:duration/60*hour<8?0:undefined,left:`calc(${lane.lane/lane.count*100}% + ${week?2:5}px)`,width:`calc(${lane.span*100/lane.count}% - ${week?4:10}px)`}}>
      {!week&&<span className="lesson-top-row"><span className="lesson-time">{l.start} – {l.end}</span><strong className="lesson-room">{l.room||'Lokacija nije navedena'}</strong></span>}
      <SourceTags lesson={l}/>
      <strong className="lesson-title" style={week?{'WebkitLineClamp':Math.max(1,Math.floor((duration/60*hour-(lessonTags(l).length?12:10))/(lessonTags(l).length?11:14)))}:undefined}>{l.title}{l.repeatingYear&&<small className="lesson-year"> · {l.repeatingYear}. g.</small>}</strong>
      {!week&&<>{l.personal&&l.note&&<span className="lesson-note" style={{WebkitLineClamp:Math.max(1,Math.floor((duration/60*hour-57)/17))}}>{l.note}</span>}{!l.personal&&<span className="lesson-group">{lessonTypeLabel(l)}{l.group&&' · '+l.group}</span>}{l.teacher&&<span className="lesson-teacher">{l.teacher}</span>}{(l.courseCode||l.progress)&&<span className="lesson-meta">{l.courseCode}{l.progress&&` · ${l.progress}`}</span>}{!l.personal&&l.note&&<span className="lesson-note">{l.note}</span>}{l.edited&&<span className="edited-marker">Osobna izmjena{l.sourceChanged?' · FERIT je ažurirao termin':''}</span>}</>}
     </LessonButton>;})}
     {!events.length&&!week&&<div className="empty-day"><h3>Nema termina</h3><p>{fmt(d,{weekday:'long',day:'numeric',month:'long'})}</p></div>}
    </div>;
   })}</div>
  </div>
 </div>;
}

function UpcomingAssessments({scheduleKey,repeatingCourses,study,groups,overrides,personal,onClose,onShowSchedule}:{scheduleKey:string;repeatingCourses:RepeatingCourse[];study:string;groups:Preferences['groups'];overrides:Preferences['overrides'];personal:Lesson[];onClose:()=>void;onShowSchedule:(lesson:Lesson)=>void}){
 const [snapshot,setSnapshot]=useState<UpcomingSnapshot|null>(null);const [loading,setLoading]=useState(true);const [refresh,setRefresh]=useState(0);const [filter,setFilter]=useState<AssessmentFilterId>('all');
 const today=dateToday();const scheduleKeys=JSON.stringify([scheduleKey,...new Set(repeatingCourses.map(c=>c.scheduleKey))]);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setSnapshot(null);
  readUpcomingWeeks(JSON.parse(scheduleKeys),today,async(key,week,signal)=>{const result=await savedSchedules.load(key,week,{signal,allowLastSaved:false});return {schedule:result.snapshot.schedule,offline:result.offline};},{signal:controller.signal,onProgress:setSnapshot}).then(setSnapshot).catch(()=>{}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[scheduleKeys,today,refresh]);
 const now=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zagreb',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
 const events=upcomingAssessments(filterCourseGroups(combinedPersonalSchedule(snapshot?.weeks.flatMap(w=>w.schedule.lessons)??[],overrides,personal,scheduleKey,repeatingCourses),groups),today,now);
 const filters=assessmentFilters(events);
 const activeFilter=filters.some(option=>option.id===filter)?filter:'all';
 const shown=filterAssessments(events,activeFilter);
 const offline=snapshot?.weeks.filter(w=>w.offline).length??0;const unavailable=snapshot?.unavailable.length??0;const inPreparation=[...new Set(snapshot?.inPreparation??[])];
 return <Modal title="Ispiti i provjere" onClose={onClose}>
  <p className="group-context">{study}</p>
  <div className="assessment-filters" role="group" aria-label="Vrsta provjere">{filters.map(({id,label})=><button type="button" key={id} aria-pressed={activeFilter===id} className={activeFilter===id?'selected':''} onClick={()=>setFilter(id)}>{label}</button>)}</div>
  <div className="assessment-toolbar"><span>Provjere: {events.length} · najskorije prvo</span><button type="button" className="icon" disabled={loading} aria-label="Osvježi provjere" onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={16} className={loading?'spin':''}/></button></div>
  {loading&&<p role="status" className="hint assessment-status">Provjeravam FERIT raspored… {snapshot?.completed??0}/{snapshot?.total??16} tjednih rasporeda</p>}
  {!!inPreparation.length&&<p role="status" className="hint assessment-status">{inPreparation.length===1?'Raspored za ':'Rasporedi za tjedne '}{inPreparation.map(assessmentWeekRange).join(', ')}{inPreparation.length===1?' još je u izradi':' još su u izradi'} na FERIT stranici.</p>}
  {!!unavailable&&<p role="alert" className="error-banner">{unavailable} {unavailable===1?'tjedni raspored':'tjednih rasporeda'} nije moguće provjeriti. Popis može biti nepotpun. Pokušaj osvježiti.</p>}
  {!!offline&&<p role="status" className="hint assessment-status">Za {offline} {offline===1?'tjedni raspored':'tjednih rasporeda'} prikazani su spremljeni podaci. Nove promjene trenutačno nije moguće provjeriti.</p>}
  <div className="assessment-list">{shown.map(lesson=><article key={lesson.id} className="assessment-card" aria-label={lesson.title}>
   <div className="assessment-card-date"><time dateTime={lesson.date}>{fmt(lesson.date,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</time><strong>{assessmentCountdown(lesson.date,today)}</strong></div>
   {lesson.personal?<span className="lesson-tags"><span>Ostalo</span></span>:<SourceTags lesson={lesson}/>}
   <h3 className="assessment-card-title">{lesson.title}</h3>{lesson.repeatingYear&&<p className="hint">Ponavljački predmet · {lesson.repeatingYear}. godina</p>}
   <div className="assessment-card-facts"><span>{lesson.start} – {lesson.end}</span><strong>{lesson.room||'Lokacija nije navedena'}</strong></div>
   <dl className="assessment-card-details">
    {!lesson.personal&&<div><dt>Vrsta · grupa</dt><dd>{lessonTypeLabel(lesson,true)+(lesson.group?' · '+lesson.group:'')}</dd></div>}
    {lesson.teacher&&<div><dt>Nastavnik</dt><dd>{lesson.teacher}</dd></div>}
    {lesson.courseCode&&<div><dt>Šifra predmeta</dt><dd>{lesson.courseCode}</dd></div>}
    {lesson.progress&&<div><dt>Termin</dt><dd>{lesson.progress}</dd></div>}
    {lesson.note&&<div><dt>Napomena</dt><dd className="assessment-card-note">{lesson.note}</dd></div>}
   </dl>
   {!lesson.personal&&<p className="assessment-card-meta">{lesson.edited?'Osobna izmjena':'Izvorni FERIT termin'}{lesson.sourceChanged&&' · Izvorni termin je promijenjen'}</p>}
   {lesson.sourceUrl&&<a className="assessment-card-source" href={lesson.sourceUrl.split('#')[0]+'#raspored'} target="_blank" rel="noreferrer">Izvorni FERIT raspored</a>}
   <button type="button" className="assessment-show-schedule" onClick={()=>onShowSchedule(lesson)}>Prikaži u rasporedu</button>
  </article>)}</div>
  {!loading&&!shown.length&&<p className="assessment-empty">{unavailable?'U dostupnim tjednima nema pronađenih provjera. Ostali tjedni još nisu provjereni.':offline?'U spremljenim terminima nema provjera za odabrani filtar.':inPreparation.length?'U objavljenom dijelu rasporeda nema provjera za odabrani filtar.':activeFilter==='all'?'U provjerenom razdoblju nema objavljenih provjera.':'Nema provjera za odabrani filtar.'}</p>}
  {snapshot&&<p className="assessment-range">Razdoblje: {fmt(snapshot.from,{day:'numeric',month:'numeric',year:'numeric'})} – {fmt(snapshot.through,{day:'numeric',month:'numeric',year:'numeric'})} Novi termini preuzimaju se pri otvaranju i osvježavanju popisa.</p>}
 </Modal>;
}

function UpdateSettings({updates,onDownload}:{updates:ReturnType<typeof useAppUpdates>;onDownload:()=>void}){
 const unsupported=updates.status==='unsupported';
 return <section className="update-settings" aria-label="Ažuriranja aplikacije">
  <h3>Ažuriranja aplikacije</h3>
  <p className="update-version">{updates.platform==='web'?'Android APK':'Instalirana verzija'} · {updates.version||'—'}</p>
  {!unsupported&&<p className="hint">Automatska provjera pri otvaranju aplikacije.</p>}
  {updates.update&&<div className="update-available"><strong>Dostupna je verzija {updates.update.version}</strong><p className="hint">Preuzmi APK i potvrdi instalaciju na telefonu.</p><button type="button" className="primary full" onClick={onDownload}><Download size={17}/>Preuzmi ažuriranje</button></div>}
  <p className="update-status hint" role="status">{updates.message|| (updates.status==='checking'?'Provjeravam ažuriranja…':updates.status==='current'?'Nema dostupnih ažuriranja.':'')}</p>
  {!unsupported&&<button type="button" className="text-action" disabled={updates.status==='checking'} onClick={()=>{void updates.check();}}><RefreshCw size={15} className={updates.status==='checking'?'spin':''}/>Provjeri ažuriranja</button>}
  {updates.checkedAt&&<p className="update-last-check">Zadnja provjera · {new Intl.DateTimeFormat('hr-HR',{day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(updates.checkedAt))}</p>}
 </section>;
}

export default function ScheduleApp(){
 const [launchElapsed,setLaunchElapsed]=useState(false);
 useEffect(()=>{const timer=window.setTimeout(()=>setLaunchElapsed(true),700);return()=>window.clearTimeout(timer);},[]);
 const openedStudies=useRef(new Set<string>());
 const [lastSavedWeek,setLastSavedWeek]=useState<SavedWeek|null>(null);
 const [details,setDetails]=useState<Lesson|null>(null);
 const [repeatingData,setRepeatingData]=useState<{context:string;schedules:Record<string,Schedule>;offline:string[];failed:string[];loading:boolean}>({context:'',schedules:{},offline:[],failed:[],loading:false});
 const [ready,setReady]=useState(false);const [prefs,setPrefs]=useState<Preferences>(EMPTY);const [studies,setStudies]=useState(fallback);const [date,setDate]=useState('');const [mode,setMode]=useState<'day'|'week'>('day');const [data,setData]=useState<Schedule|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [offline,setOffline]=useState(false);const [modal,setModal]=useState<'study'|'date'|'groups'|'settings'|'reset'|'assessments'|'repeating'|null>(null);const [edit,setEdit]=useState<Lesson|null>(null);const [refresh,setRefresh]=useState(0);const [toast,setToast]=useState('');const [undo,setUndo]=useState<Preferences|null>(null);const [landscape,setLandscape]=useState(false);const [viewportWidth,setViewportWidth]=useState(400);const [groupCourses,setGroupCourses]=useState<LabCourse[]>([]);const [groupLoading,setGroupLoading]=useState(false);const [groupError,setGroupError]=useState('');
 useEffect(()=>{
  let mounted=true;
  readPhonePreferences(STORAGE).then(value=>{if(!mounted)return;try{const saved=JSON.parse(value??'null');setPrefs({...EMPTY,...(saved&&typeof saved==='object'?saved:{}),theme:storedTheme(saved?.theme,matchMedia('(prefers-color-scheme: dark)').matches)});}catch{setPrefs({...EMPTY,theme:storedTheme(null,matchMedia('(prefers-color-scheme: dark)').matches)});}setDate(dateToday());setReady(true);}).catch(()=>{if(mounted){setDate(dateToday());setReady(true);}});
  const media=matchMedia('(orientation: landscape)');
  const actualLandscape=()=>isPhoneApp()&&screen.orientation?.type?screen.orientation.type.startsWith('landscape'):media.matches;
  const phoneSized=()=>isPhoneApp()||(Math.min(innerWidth,innerHeight)<600&&Math.max(innerWidth,innerHeight)<1000);
  let previous=actualLandscape();setLandscape(previous);setViewportWidth(innerWidth);if(previous&&phoneSized())setMode('week');
  const orientation=()=>{const next=actualLandscape();setLandscape(next);setViewportWidth(innerWidth);if(next!==previous&&phoneSized()){setMode(next?'week':'day');setDetails(null);}previous=next;};
  window.addEventListener('resize',orientation);media.addEventListener('change',orientation);screen.orientation?.addEventListener('change',orientation);void phoneOrientation('auto').catch(()=>{});
  const openToday=()=>{void phoneOrientation('auto').catch(()=>{});setDate(dateToday());setMode(actualLandscape()&&phoneSized()?'week':'day');setModal(null);setEdit(null);setDetails(null);setRefresh(n=>n+1);};
  const wake=()=>{if(document.visibilityState==='visible')openToday();};const resume=(event:PageTransitionEvent)=>{if(event.persisted)openToday();};document.addEventListener('visibilitychange',wake);window.addEventListener('pageshow',resume);const stopPhoneResume=onPhoneResume(openToday);
  return()=>{mounted=false;stopPhoneResume();media.removeEventListener('change',orientation);screen.orientation?.removeEventListener('change',orientation);window.removeEventListener('resize',orientation);document.removeEventListener('visibilitychange',wake);window.removeEventListener('pageshow',resume);};
 },[]);
 useEffect(()=>{if(!ready||!launchElapsed)return;document.documentElement.dataset.theme=prefs.theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',prefs.theme==='dark'?'#171d21':'#ffffff');void phoneTheme(prefs.theme).catch(()=>{});},[prefs.theme,ready,launchElapsed]);
 useEffect(()=>{if(ready)void savePhonePreferences(STORAGE,JSON.stringify(prefs)).catch(()=>setToast('Spremanje na uređaj nije dostupno.'));},[prefs,ready]);
 useEffect(()=>{const c=new AbortController();scheduleClient.catalogue(c.signal).then(d=>{setStudies(d.studies);try{localStorage.setItem('ferit-catalogue',JSON.stringify(d.studies));}catch{}}).catch(()=>{try{const cached=localStorage.getItem('ferit-catalogue');if(cached)setStudies(JSON.parse(cached));}catch{}});return()=>c.abort();},[]);
 const updates=useAppUpdates(ready);
 const downloadUpdate=()=>{void updates.download().catch(()=>{setUndo(null);setToast('Preuzimanje nije moguće otvoriti. Pokušaj ponovno.');});};
 const key=prefs.selection?.key;const week=date?monday(date):'';const rotated=mode==='week'&&!landscape&&viewportWidth<900;
 const repeatingCourses=useMemo(()=>key?activeRepeatingCourses(studies,key,prefs.repeating?.[key]):[],[studies,key,prefs.repeating]);
 const extraKeys=JSON.stringify([...new Set(repeatingCourses.map(c=>c.scheduleKey))].sort());
 const scheduleKeys=JSON.stringify(key?[key,...JSON.parse(extraKeys)]:[]);
 const repeatingContext=`${key}:${week}:${extraKeys}`;
 const extraSchedules=repeatingData.context===repeatingContext?Object.values(repeatingData.schedules):[];
 const sourceLessons=[...(data?.lessons??[]),...extraSchedules.flatMap(s=>s.lessons)];
 useEffect(()=>{if(!rotated)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[rotated]);
 useEffect(()=>{
  const keys:string[]=JSON.parse(scheduleKeys);let courses:LabCourse[]=[];
  for(const sourceKey of keys){try{const saved=JSON.parse(localStorage.getItem('ferit-groups:'+sourceKey)??'[]');if(Array.isArray(saved))courses.push(...saved);}catch{}}
  setGroupCourses(courses);
 },[scheduleKeys]);
 useEffect(()=>{
  if(!key)return;
  setGroupCourses(current=>{
   const next=mergeLabCourses(current,sourceLessons.filter(l=>JSON.parse(scheduleKeys).includes(l.scheduleKey)));
   for(const sourceKey of JSON.parse(scheduleKeys)){try{localStorage.setItem('ferit-groups:'+sourceKey,JSON.stringify(next.filter(c=>c.id.startsWith(sourceKey+':'))));}catch{}}
   return next;
  });
 },[data,repeatingData,scheduleKeys,key]);
 useEffect(()=>{
  if(modal!=='groups'||!key||!week)return;
  const controller=new AbortController();setGroupLoading(true);setGroupError('');
  void Promise.allSettled((JSON.parse(scheduleKeys) as string[]).map(sourceKey=>scheduleClient.groups(sourceKey,week,controller.signal))).then(results=>{
   if(controller.signal.aborted)return;
   const available=results.flatMap(r=>r.status==='fulfilled'?r.value.courses:[]);
   setGroupCourses(current=>{
    const next=mergeLabCourses([...current,...available],[]);
    for(const sourceKey of JSON.parse(scheduleKeys)){try{localStorage.setItem('ferit-groups:'+sourceKey,JSON.stringify(next.filter(c=>c.id.startsWith(sourceKey+':'))));}catch{}}
    return next;
   });
   if(results.some(r=>r.status==='rejected'||r.value.partial))setGroupError('Neke objavljene grupe trenutno nije moguće provjeriti. Prikazani su dostupni i spremljeni odabiri.');
  }).finally(()=>{if(!controller.signal.aborted)setGroupLoading(false);});
  return()=>controller.abort();
 },[modal,key,week,scheduleKeys]);
 useEffect(()=>{
  const keys:string[]=JSON.parse(extraKeys);
  if(!ready||!key||!week)return;
  const controller=new AbortController();
  setRepeatingData({context:repeatingContext,schedules:{},offline:[],failed:[],loading:keys.length>0});
  const update=(sourceKey:string,schedule:Schedule,offline:boolean)=>{
   if(controller.signal.aborted)return;
   setRepeatingData(current=>({...current,schedules:{...current.schedules,[sourceKey]:schedule},offline:[...current.offline.filter(k=>k!==sourceKey),...(offline?[sourceKey]:[])]}));
  };
  void Promise.allSettled(keys.map(async sourceKey=>{
   try{
    const result=await savedSchedules.load(sourceKey,week,{signal:controller.signal,allowLastSaved:false,onSaved:cached=>update(sourceKey,cached.schedule,true)});
    update(sourceKey,result.snapshot.schedule,result.offline);
   }catch{
    if(!controller.signal.aborted)setRepeatingData(current=>({...current,failed:[...current.failed,sourceKey]}));
   }
  })).then(()=>{if(!controller.signal.aborted)setRepeatingData(current=>({...current,loading:false}));});
  return()=>controller.abort();
 },[key,week,ready,refresh,extraKeys,repeatingContext]);
 useEffect(()=>{
  if(!ready||!key||!week)return;
  const controller=new AbortController();setError('');setLastSavedWeek(null);setLoading(true);setData(current=>current?.sourceUrl.endsWith(`/${week}/${key}`)?current:null);
  savedSchedules.load(key,week,{signal:controller.signal,allowLastSaved:!openedStudies.current.has(key),onSaved:cached=>{openedStudies.current.add(key);setData(cached.schedule);setOffline(true);}}).then(result=>{
   if(controller.signal.aborted)return;
   openedStudies.current.add(key);setData(result.snapshot.schedule);setOffline(result.offline);
   if(result.fallback){setDate(addDays(result.snapshot.week,Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(week+'T12:00:00Z'))/86400000)));setToast('FERIT nije dostupan. Prikazujem posljednji spremljeni tjedan.');}
  }).catch(error=>{if(!controller.signal.aborted){setOffline(true);setError(error.message||'FERIT trenutno nije dostupan.');if(error instanceof ScheduleUnavailableError)setLastSavedWeek(error.lastSaved);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[key,week,ready,refresh]);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),6500);return()=>clearTimeout(t);},[toast]);
 const all=key?combinedPersonalSchedule(sourceLessons,prefs.overrides,prefs.personal,key,repeatingCourses):[];const lessons=filterCourseGroups(all,prefs.groups);
 const visibleGroupCourses=groupCourses.filter(c=>c.id.startsWith(key+':')||repeatingCourses.some(course=>c.id===repeatingCourseId(course)+':LV'&&(!course.selectedTypes||course.selectedTypes.includes('LV')))).map(c=>c.id.startsWith(key+':')?c:{...c,title:c.title+' · '+c.id.split('-')[0]+'. godina'});
 const groupSummary=visibleGroupCourses.filter(c=>prefs.groups[c.id]).map(c=>c.title+': '+prefs.groups[c.id]).join(' · ')||'Sve objavljene grupe';
 const selectedStudy=studies.find(s=>s.options.some(o=>o.key===key));const selectedOption=selectedStudy?.options.find(o=>o.key===key);const saveSelection=(selection:Selection)=>setPrefs(p=>({...p,selection}));
 const saveLesson=(l:Lesson)=>{setUndo(prefs);setPrefs(p=>l.personal?({...p,personal:[...p.personal.filter(x=>x.id!==l.id),l]}):({...p,overrides:{...p.overrides,[l.id]:{original:p.overrides[l.id]?.original??sourceLessons.find(x=>x.id===l.id)??l,edited:l}}}));setToast('Termin je spremljen.');};
 const removeLesson=(l:Lesson)=>{setUndo(prefs);setPrefs(p=>l.personal?({...p,personal:p.personal.filter(x=>x.id!==l.id)}):({...p,overrides:{...p.overrides,[l.id]:{original:p.overrides[l.id]?.original??l,hidden:true}}}));setToast('Termin je uklonjen.');};
 const restore=(id:string)=>{setUndo(prefs);setPrefs(p=>{const overrides={...p.overrides};delete overrides[id];return {...p,overrides};});setToast('Vraćen je FERIT termin.');};
 const resetSchedule=()=>{setUndo(prefs);setPrefs(resetPersonalSchedule);setEdit(null);setModal(null);setRefresh(n=>n+1);setToast('Osobne izmjene su poništene.');};
 const switchDay=()=>{setMode('day');setDetails(null);void phoneOrientation('auto').catch(()=>{});if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});};
 const switchWeek=()=>{setMode('week');setDetails(null);void phoneOrientation('auto').catch(()=>{});};
 const addEvent=()=>setEdit({id:personalId(),scheduleKey:key!,date,title:'',start:'12:00',end:'13:00',room:'',type:'OSOBNO',typeLabel:'Osobni događaj',teacher:'',group:'',progress:'',courseCode:'',personal:true,color:'purple'});
 if(!ready||!launchElapsed)return <LaunchScreen/>;
 if(!prefs.selection)return <main className="app-shell setup-mode"><StudyPicker inline studies={studies} selection={null} onSave={saveSelection} onClose={()=>{}}/></main>;
 const dateControl=<button className="date-button" aria-haspopup="dialog" aria-expanded={modal==='date'} onClick={()=>setModal('date')}>{mode==='day'?fmt(date,{weekday:'short',day:'numeric',month:'long'}):fmt(week,{day:'numeric'})+' – '+fmt(addDays(week,6),{day:'numeric',month:'long'})}<ChevronDown size={17}/></button>;
 const viewControl=<div className="segments" role="group" aria-label="Prikaz rasporeda"><button aria-pressed={mode==='day'} className={mode==='day'?'active':''} onClick={switchDay}>Dan</button><button aria-pressed={mode==='week'} className={mode==='week'?'active':''} onClick={switchWeek}>Tjedan</button></div>;
 return <main className={'app-shell '+(mode==='week'?'week-mode ':'')+(rotated?'rotated-week':'')} onClick={e=>{if(mode!=='day'||e.target!==e.currentTarget)return;const bounds=e.currentTarget.querySelector('.grid-wrapper')?.getBoundingClientRect();if(!bounds||e.clientY<bounds.top||e.clientY>bounds.bottom)return;if(e.clientX<bounds.left)setDate(addDays(date,-1));else if(e.clientX>bounds.right)setDate(addDays(date,1));}}>
  {mode==='week'?<header className="week-toolbar">{dateControl}<button className="study-switch" title={(selectedStudy?.name??prefs.selection.study)+' · '+(selectedOption?.label??key)} onClick={()=>setModal('study')}><span>{(selectedStudy?.name??prefs.selection.study).replace(/^(Sveučilišni (prijediplomski|diplomski)|Stručni) studij\s*/,'')} · {selectedOption?.label??key}</span><ChevronDown size={14}/></button>{viewControl}<button className="icon" aria-label="Dodaj osobni događaj" onClick={addEvent}><Plus size={21}/></button><button className="icon" aria-label="Postavke rasporeda" onClick={()=>setModal('settings')}><Menu size={21}/></button></header>:<>
   <header className="app-header"><button className="study-switch" title={(selectedStudy?.name??prefs.selection.study)+' · '+(selectedOption?.label??key)} onClick={()=>setModal('study')}><span>{selectedStudy?.name??prefs.selection.study} · {selectedOption?.label??key}</span><ChevronDown size={16}/></button><button className="icon" aria-label="Postavke rasporeda" onClick={()=>setModal('settings')}><SlidersHorizontal size={21}/></button></header>
   <section className="date-toolbar">{dateControl}{viewControl}</section>
  </>}
  {updates.showNotice&&<aside className="app-update-notice" aria-label="Dostupno ažuriranje"><Download size={16}/><span><strong>Dostupno ažuriranje</strong><small>Verzija {updates.update?.version}</small></span><button className="update-download" onClick={downloadUpdate}>Preuzmi</button><button className="icon" onClick={updates.dismiss} aria-label="Sakrij obavijest o ažuriranju"><X size={16}/></button></aside>}
  {loading&&!data&&<div className="loading" role="status">Dohvaćam raspored…</div>}
  {error&&!data&&<div className="error-banner" role="alert"><span>{error}</span><button onClick={()=>setRefresh(n=>n+1)}>Pokušaj ponovno</button>{lastSavedWeek&&<button onClick={()=>setDate(lastSavedWeek.week)}>Prikaži spremljeni tjedan ({fmt(lastSavedWeek.week,{day:'numeric',month:'numeric'})})</button>}</div>}
  {(data||extraSchedules.length>0||prefs.personal.length>0)&&<TimeGrid date={date} lessons={lessons} week={mode==='week'} rotated={rotated} onLesson={l=>{setDetails(null);setEdit(l);}} onDetails={setDetails} onDay={d=>{setDate(d);switchDay();}} onSwipe={n=>setDate(addDays(date,n*(mode==='week'?7:1)))}/>}
  <footer className="sync-footer"><span className="sync-status" role="status" title={data?`${offline?'Prikazan spremljeni raspored. ' :''}Posljednje preuzimanje: ${new Intl.DateTimeFormat('hr-HR',{dateStyle:'short',timeStyle:'short'}).format(new Date(data.fetchedAt))}`:undefined}>{data?'FERIT · '+(offline?'Spremljeno':'Ažurirano')+' '+new Intl.DateTimeFormat('hr-HR',{hour:'2-digit',minute:'2-digit'}).format(new Date(data.fetchedAt)):offline?'FERIT · Izvan mreže':'FERIT'}</span><button className="icon" onClick={()=>setRefresh(n=>n+1)} aria-label="Osvježi raspored"><RefreshCw className={loading||repeatingData.loading?'spin':''} size={15}/></button>{data?.teachingWeek&&<span className="footer-teaching-week">{teachingWeekLabel(data.teachingWeek)}</span>}</footer>
  {mode==='day'&&<button className="add-event" aria-label="Dodaj osobni događaj" onClick={addEvent}><Plus size={25}/></button>}
  {mode==='week'&&details&&<LessonDetails lesson={details} rotated={rotated} onClose={()=>setDetails(null)}/>}
  {modal==='study'&&<StudyPicker studies={studies} selection={prefs.selection} onSave={saveSelection} onClose={()=>setModal(null)}/>}
  {modal==='date'&&<CalendarPicker date={date} onChoose={setDate} onClose={()=>setModal(null)}/>}
  {modal==='groups'&&<GroupPicker courses={visibleGroupCourses} groups={prefs.groups} loading={groupLoading} error={groupError} study={(selectedStudy?.name??prefs.selection.study)+' · '+(selectedOption?.label??key)} onSave={groups=>setPrefs({...prefs,groups})} onClose={()=>setModal(null)}/>}
  {modal==='settings'&&<Modal title="Postavke" onClose={()=>setModal(null)}>
   <fieldset className="theme-field"><legend>Izgled</legend><div className="theme-options"><button type="button" aria-pressed={prefs.theme==='light'} className={prefs.theme==='light'?'selected':''} onClick={()=>setPrefs(p=>({...p,theme:'light'}))}><Sun size={20}/>Svijetla{prefs.theme==='light'&&<Check size={15}/>}</button><button type="button" aria-pressed={prefs.theme==='dark'} className={prefs.theme==='dark'?'selected':''} onClick={()=>setPrefs(p=>({...p,theme:'dark'}))}><Moon size={20}/>Tamna{prefs.theme==='dark'&&<Check size={15}/>}</button></div></fieldset>
   <div className="settings-list">
    {supportsHomeWidget()&&<button className="settings-row" onClick={()=>{void addHomeWidget().then(requested=>{if(!requested)setToast('Na početnom zaslonu zadrži prst, odaberi Widgeti pa FERIT · Danas.');}).catch(()=>setToast('Na početnom zaslonu zadrži prst, odaberi Widgeti pa FERIT · Danas.'));}}><span><strong>Widget na početnom zaslonu</strong><small>Današnji termini, tijek nastave i provjera svaki sat</small></span><Plus size={18}/></button>}
    <button className="settings-row" onClick={()=>setModal('assessments')}><span><strong>Ispiti i provjere</strong><small>Nadolazeći termini i oznake iz rasporeda</small></span><ChevronRight size={18}/></button>
    <button className="settings-row" onClick={()=>setModal('study')}><span><strong>Studij i godina</strong><small>{selectedStudy?.name??prefs.selection.study} · {selectedOption?.label??key}</small></span><ChevronRight size={18}/></button>
    <button className="settings-row" onClick={()=>setModal('repeating')}><span><strong>Ponavljački predmeti</strong><small>{repeatingCourses.length?repeatingCourses.map(c=>c.title).join(' · '):'Dodaj predmete s godine ispod tvoje'}</small></span><ChevronRight size={18}/></button>
    <button className="settings-row" disabled={!prefs.selection} onClick={()=>setModal('groups')}><span><strong>LV grupe</strong><small>{groupSummary}</small></span><ChevronRight size={18}/></button>
    <button className="settings-row reset-schedule-row" onClick={()=>setModal('reset')}><span><strong>Vrati izvorni raspored</strong><small>Poništi osobne izmjene i događaje</small></span><RotateCcw size={18}/></button>
    <a className="settings-row source-link" href={data?.sourceUrl??'https://www.ferit.unios.hr/studenti/raspored-nastave-i-ispita'} target="_blank" rel="noreferrer"><span><strong>Izvorni FERIT raspored</strong><small>ferit.unios.hr</small></span><ChevronRight size={18}/></a>
   </div>
   <UpdateSettings updates={updates} onDownload={downloadUpdate}/>
  </Modal>}
  {modal==='repeating'&&key&&<RepeatingPicker key={key} studies={studies} scheduleKey={key} settings={prefs.repeating?.[key]??EMPTY_REPEATING} week={week} onSave={settings=>{setDetails(null);setPrefs(p=>({...p,repeating:{...p.repeating,[key]:settings}}));}} onClose={()=>setModal('settings')}/>}
  {modal==='assessments'&&key&&<UpcomingAssessments key={key} scheduleKey={key} repeatingCourses={repeatingCourses} study={(selectedStudy?.name??prefs.selection.study)+' · '+(selectedOption?.label??key)} groups={prefs.groups} overrides={prefs.overrides} personal={prefs.personal} onClose={()=>setModal(null)} onShowSchedule={lesson=>{setModal(null);setDate(lesson.date);switchDay();}}/>}
  {modal==='reset'&&<Modal title="Vrati izvorni raspored?" variant="confirmation" onClose={()=>setModal('settings')} actionsClassName="reset-actions" actions={<><button type="button" className="text-action" onClick={()=>setModal('settings')}>Odustani</button><button type="button" className="primary" onClick={resetSchedule}><RotateCcw size={16}/>Vrati raspored</button></>}>
   <p className="reset-explanation">Uklonit će se osobni događaji i sve izmjene termina iz svih tvojih rasporeda. Pomaknuti i uklonjeni termini vratit će se prema FERIT rasporedu.</p>
   <p className="hint reset-preserved">Studij, godina, ponavljački predmeti, LV grupe i tema ostaju spremljeni.</p>
  </Modal>}
  {edit&&<LessonEditor lesson={edit} original={edit.personal?undefined:sourceLessons.find(l=>l.id===edit.id)??prefs.overrides[edit.id]?.original} onSave={saveLesson} onDelete={()=>removeLesson(edit)} onRestore={edit.edited?()=>restore(edit.id):undefined} onClose={()=>setEdit(null)}/>}
  {toast&&<div className="toast" role="status"><span>{toast}</span>{undo&&<button onClick={()=>{setPrefs(undo);setUndo(null);setToast('Promjena je poništena.');}}>Poništi</button>}</div>}
 </main>;
}
