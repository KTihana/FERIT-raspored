import type {PersonalColor} from './event-colors';
export const FERIT_URL = 'https://www.ferit.unios.hr/studenti/raspored-nastave-i-ispita';
export class ScheduleInPreparationError extends Error{
 readonly code='SCHEDULE_IN_PREPARATION';
 constructor(){super('FERIT raspored za ovaj tjedan još je u izradi.');this.name='ScheduleInPreparationError';}
}
export type ScheduleOption = { label: string; key: string; year: number; code: string; exam: boolean; legacy: boolean };
export type Study = { name: string; options: ScheduleOption[] };
export type StudyChoice = {id:string;study:string;label:string;options:ScheduleOption[]};
export type LabCourse = {id:string;title:string;courseCode:string;groups:string[]};
export function studyChoices(studies:Study[],savedKey?:string):StudyChoice[]{
 return studies.flatMap(s=>{
  const options=s.options.filter(o=>!o.legacy||o.key===savedKey);
  return options.length?[{id:s.name,study:s.name,label:s.name,options}]:[];
 });
}
export type Lesson = { id: string; sourceId?: string; scheduleKey: string; date: string; title: string; courseCode: string; start: string; end: string; room: string; type: string; typeLabel: string; tags?: string[]; teacher: string; group: string; progress: string; sourceUrl?: string; personal?: boolean; includeInAssessments?: boolean; edited?: boolean; sourceChanged?: boolean; repeatingYear?: number; note?: string; color?: PersonalColor };
export type Schedule = { lessons: Lesson[]; fetchedAt: string; sourceUrl: string; teachingWeek: string };
export type Override = { original: Lesson; edited?: Lesson; hidden?: boolean };
const entities: Record<string,string> = { nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",ndash:'–',mdash:'—' };
export function plain(html:string):string { return html.replace(/<[^>]*>/g,' ').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi,(_,e:string)=>e[0]==='#'?String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10)):(entities[e]??`&${e};`)).replace(/\s+/g,' ').trim(); }
function divs(html:string, className:string):string[] {
 const opening=/<div\b[^>]*class\s*=\s*(['"])(.*?)\1[^>]*>/gi; const result:string[]=[]; let m:RegExpExecArray|null;
 while((m=opening.exec(html))) {
  if(!m[2].split(/\s+/).includes(className)) continue;
  const tags=/<\/?div\b[^>]*>/gi;tags.lastIndex=opening.lastIndex;let depth=1,t:RegExpExecArray|null;
  while((t=tags.exec(html))) {depth += t[0].startsWith('</')?-1:1;if(depth===0){result.push(html.slice(m.index,tags.lastIndex));opening.lastIndex=tags.lastIndex;break;}}
 }
 return result;
}
export function parseCatalogue(html:string):Study[] {
 const pos=html.indexOf('ODABIR STUDIJA I GODINE'); if(pos<0) throw new Error('FERIT odabir studija nije pronađen.');
 const section=html.slice(pos).split('</div>')[0];const studies:Study[]=[];
 for(const p of section.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
  const name=plain(p[1].split(/<br\b/i)[0]);const options:ScheduleOption[]=[];
  for(const a of p[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
   const route=a[1].match(/href=['"][^'"]*\/(\d+)-(\d+)#raspored['"]/);const label=plain(a[2]);if(!route||!label)continue;
   const year=Number(route[1]);const code=label.replace(/\b\d+\s*\.\s*g\./,'').replace(/\([^)]*\)/g,'').trim();
   options.push({label,key:`${route[1]}-${route[2]}`,year,code,exam:label.includes('ispiti'),legacy:/display\s*:\s*none/i.test(a[1])});
  }
  if(name&&options.length)studies.push({name,options});
 }
 if(studies.length<5) throw new Error('FERIT popis studija nije moguće pročitati.');return studies;
}
export function parseSchedule(html:string,key:string,sourceUrl:string):Schedule {
 if(!html.includes('raspored'))throw new Error('FERIT raspored nije dostupan.');const lessons:Lesson[]=[];
 const catalogueStart=html.indexOf('ODABIR STUDIJA I GODINE');
 if(catalogueStart>=0){
  const section=html.slice(catalogueStart).split('</div>')[0];
  const selected=[...section.matchAll(/<a\b([^>]*)>[\s\S]*?<\/a>/g)].find(a=>/class=['"][^'"]*\bselected\b/.test(a[1]));
  const selectedKey=selected?.[1].match(/\/(\d+-\d+)#raspored/)?.[1];
  if(selectedKey&&selectedKey!==key)throw new Error('FERIT je vratio drugi raspored. Odabrani raspored trenutno nije dostupan.');
 }
 const days=divs(html,'dan');
 if(!days.length){
  const pending=[...html.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)].some(heading=>/^Raspored za ovaj tjedan je u izradi\.?$/i.test(plain(heading[1])));
  if(pending)throw new ScheduleInPreparationError();
  throw new Error('FERIT je promijenio format rasporeda.');
 }
 for(const day of days) {
  const dm=plain(divs(day,'naziv-dan')[0]??'').match(/(\d{2})\.(\d{2})\.(\d{4})/);if(!dm)continue;const date=`${dm[3]}-${dm[2]}-${dm[1]}`;
  for(const block of divs(day,'blokovi')) {
   const details=block.match(/<span\b[^>]*class=['"][^'"]*\bhide\b[^'"]*['"][^>]*>([\s\S]*?)<\/span>/i)?.[1]??'';
   const lines=details.split(/<br\b[^>]*>/i).map(plain).filter(Boolean);const range=lines.join(' ').match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);if(!range)continue;
   const course=details.match(/<a\b[^>]*href=['"][^'"]*(?:upisi|studijski)[^'"]*['"][^>]*>([\s\S]*?)<\/a>/i)?.[1];
   const top=block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1]??'';const headline=top.split(/<br\b[^>]*>/i).map(plain).filter(Boolean);
   const fullTitle=plain(course??headline[0]??'Nastava');const codeMatch=fullTitle.match(/\(([^()]+)\)$/);const title=codeMatch?fullTitle.slice(0,codeMatch.index).trim():fullTitle;
   const room=plain(headline[1]??'').replace(/\([^)]*\)/g,'').trim();const typeLine=lines[0]??'';
   // Assessment annotations are separate from the teaching type: an AV can be a kontrolna zadaća.
   const courseLine=details.split(/<br\b[^>]*>/i).find(line=>/<a\b[^>]*href=['"][^'"]*(?:upisi|studijski)/i.test(line))??'';
   const annotation=plain(courseLine.replace(/^[\s\S]*?<\/a>/i,''));
   const metadata=annotation.match(/^(\((?:izborni|obvezni)\))\s*/i)?.[1];
   const additionalNotes=details.split(/<br\b[^>]*>/i).slice(1).filter(line=>!/<a\b[^>]*href=['"][^'"]*(?:upisi|studijski|imenik|google\.com\/calendar)/i.test(line)).map(plain).filter(line=>line&&!/^\d+$/.test(line)&&!/^\(\d+\s*\/\s*\d+\)$/.test(line)&&!/^Otvori grupu\b/.test(line)&&!/^\d{1,2}:\d{2}\s*[-–]/.test(line));
   const candidates=[metadata??'',metadata?annotation.slice(metadata.length).trim():annotation,...[...top.matchAll(/<i\b[^>]*>([\s\S]*?)<\/i>/gi)].map(m=>plain(m[1])),...headline.slice(2).map(line=>line.replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/,'').trim()),...additionalNotes];
   const seenTags=new Set<string>();const tags=candidates.filter(tag=>{const key=tag.toLocaleLowerCase('hr');if(!tag||seenTags.has(key))return false;seenTags.add(key);return true;});
   const type=typeLine.match(/^(PR|AV|LV|KV|S|V)\b/)?.[1]??typeLine.match(/^([A-ZČĆŽŠĐ][A-ZČĆŽŠĐ0-9_]{0,15})\s*[-–—:]/)?.[1]??(/\bispit\b/i.test(typeLine)?'ISPIT':'OSTALO');
   const teacher=plain(details.match(/<a\b[^>]*href=['"][^'"]*imenik[^'"]*['"][^>]*>([\s\S]*?)<\/a>/i)?.[1]??'');
   const group=lines.find(l=>l.startsWith('Otvori grupu '))?.replace('Otvori grupu ','')??'';const progress=lines.find(l=>/^\(\d+\s*\/\s*\d+\)$/.test(l))??'';
   const sourceId=block.match(/\bblok(\d+)/)?.[1]??`${title}-${range[1]}-${room}-${group}`;
   lessons.push({id:`${key}:${date}:${sourceId}`,sourceId,scheduleKey:key,date,title,courseCode:codeMatch?.[1]??'',start:range[1].padStart(5,'0'),end:range[2].padStart(5,'0'),room,type,typeLabel:typeLine,...(tags.length?{tags}:{}),teacher,group,progress,sourceUrl});
  }
 }
 return {lessons,fetchedAt:new Date().toISOString(),sourceUrl,teachingWeek:plain(html.match(/<a[^>]*id=['"]kalendar['"][^>]*>([\s\S]*?)<\/a>/i)?.[1]??'')};
}
export function minutes(time:string):number {const [h,m]=time.split(':').map(Number);return h*60+m;}
export function dateToday():string {const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zagreb',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=(k:string)=>parts.find(p=>p.type===k)?.value;return `${get('year')}-${get('month')}-${get('day')}`;}
export function addDays(date:string,n:number):string {const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function monday(date:string):string {const day=new Date(`${date}T12:00:00Z`).getUTCDay();return addDays(date,-((day+6)%7));}
export function signature(l:Lesson):string{return JSON.stringify([l.title,l.start,l.end,l.room,l.teacher,l.group,l.type,l.typeLabel,l.tags??[]]);}
export function applyPersonal(source:Lesson[],overrides:Record<string,Override>,personal:Lesson[],key:string):Lesson[] {
 const seen=new Set<string>();const result=source.flatMap(l=>{seen.add(l.id);const o=overrides[l.id];if(o?.hidden)return [];return [o?.edited?{...o.edited,type:l.type,typeLabel:l.typeLabel,tags:l.tags,teacher:l.teacher,group:l.group,courseCode:l.courseCode,progress:l.progress,edited:true,sourceChanged:signature(l)!==signature(o.original)}:l];});
 for(const [id,o]of Object.entries(overrides)){if(!seen.has(id)&&o.original.scheduleKey===key&&!o.hidden&&o.edited)result.push({...o.edited,edited:true,sourceChanged:true});}
 return [...result,...personal.filter(l=>l.scheduleKey===key)].sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start));
}
export function courseGroupKey(l:Lesson):string{return `${l.scheduleKey}:${l.courseCode||l.title}:${l.type}`;}
export function mergeLabCourses(courses:LabCourse[],lessons:Lesson[]):LabCourse[]{
 const result=new Map<string,LabCourse>();
 for(const c of [...courses,...lessons.filter(l=>l.type==='LV'&&l.group).map(l=>({id:courseGroupKey(l),title:l.title,courseCode:l.courseCode,groups:[l.group]}))]){
  const previous=result.get(c.id);result.set(c.id,{...c,groups:[...new Set([...(previous?.groups??[]),...c.groups])].sort((a,b)=>a.localeCompare(b,'hr',{numeric:true}))});
 }
 return [...result.values()].sort((a,b)=>a.title.localeCompare(b.title,'hr'));
}
export function swipeDirection(x:number,y:number,rotated=false):number{
 const horizontal=rotated?y:x,vertical=rotated?x:y;
 return Math.abs(horizontal)>65&&Math.abs(horizontal)>Math.abs(vertical)*1.5?(horizontal<0?1:-1):0;
}
export function filterCourseGroups(lessons:Lesson[],groups:Record<string,string>):Lesson[]{return lessons.filter(l=>l.personal||!groups[courseGroupKey(l)]||l.group===groups[courseGroupKey(l)]);}
