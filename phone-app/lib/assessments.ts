import {minutes,type Lesson} from './ferit.ts';

const teachingTypes=new Set(['PR','AV','LV','KV','S','V']);
const normalized=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('hr');
const courseMetadata=/^\(?\s*(izborni|obvezni)(?:\s+(predmet|kolegij))?\s*\)?$/;
// Observed teaching notices are still displayed in the timetable, but are not assessments.
const teachingNotice=/^(?:nepoznato|nastava|predavanj[ae](?:\s+.*)?|nadoknada(?:\s+predavanja)?|av\d+\s+u\s+.+|auditorne\s+vjezbe\s+u\s+.+|erasmus\s+web|grupne\s+konzultacije(?:\s+\([^)]*\))?)$/;
export type AssessmentCategory='assignment'|'colloquium'|'pre-exam'|'exam'|'other';
export type AssessmentFilterId='all'|'other'|`source:${string}`;
export type AssessmentFilter={id:AssessmentFilterId;label:string};
function categoryFromText(value:string):AssessmentCategory|null{
 const text=normalized(value);
 if(/\b(kontroln\w*\s+zadac\w*|kontrolni\s+zadatak|kz)\b/.test(text))return 'assignment';
 if(/\bkolokvij\w*\b/.test(text))return 'colloquium';
 if(/\bpredrok\w*\b/.test(text))return 'pre-exam';
 if(/\b(ispit\w*|pismeni|usmeni)\b/.test(text))return 'exam';
 return null;
}

/** Keep the actual FERIT wording, including annotations we have never encountered before. */
export function lessonTags(lesson:Lesson):string[]{
 if(lesson.personal)return [];
 const tags=Array.isArray(lesson.tags)?lesson.tags.filter((tag):tag is string=>typeof tag==='string'&&!!tag.trim()):[];
 if((!teachingTypes.has(lesson.type)||categoryFromText(lesson.typeLabel))&&lesson.typeLabel.trim()&&normalized(lesson.typeLabel)!=='nepoznato')tags.push(lesson.typeLabel.trim());
 const seen=new Set<string>();
 return tags.filter(tag=>{const key=normalized(tag);if(seen.has(key))return false;seen.add(key);return true;});
}

export function lessonTypeLabel(lesson:Lesson,full=false):string{
 return (full||!teachingTypes.has(lesson.type))&&lesson.typeLabel?lesson.typeLabel:lesson.type;
}

export function assessmentCategory(lesson:Lesson):AssessmentCategory|null{
 if(lesson.personal)return lesson.includeInAssessments===true?'other':null;
 const category=categoryFromText([...lessonTags(lesson),lesson.typeLabel].join(' '));
 if(category)return category;
 // Elective-course metadata is not an assessment; unfamiliar notices remain discoverable.
 return assessmentTags(lesson).length?'other':null;
}

export function assessmentTags(lesson:Lesson):string[]{
 return lessonTags(lesson).filter(tag=>!!categoryFromText(tag)||(!courseMetadata.test(normalized(tag))&&!teachingNotice.test(normalized(tag))));
}

/** Every source filter is the published label itself, never a made-up category name. */
export function assessmentFilters(lessons:Lesson[]):AssessmentFilter[]{
 const labels=new Map<AssessmentFilterId,string>();
 for(const lesson of lessons){
  if(!assessmentCategory(lesson))continue;
  for(const tag of assessmentTags(lesson)){
   const id=`source:${normalized(tag)}` as const;
   if(!labels.has(id))labels.set(id,tag);
  }
 }
 return [{id:'all',label:'Sve'},...[...labels].sort((a,b)=>a[1].localeCompare(b[1],'hr',{numeric:true})).map(([id,label])=>({id,label})),{id:'other',label:'Ostalo'}];
}

export function filterAssessments(lessons:Lesson[],filter:AssessmentFilterId):Lesson[]{
 return lessons.filter(lesson=>{
  if(!assessmentCategory(lesson))return false;
  if(filter==='all')return true;
  if(filter==='other')return lesson.personal===true&&lesson.includeInAssessments===true;
  return assessmentTags(lesson).some(tag=>`source:${normalized(tag)}`===filter);
 });
}

/** Calendar-date ordering; never use the AV/LV/PR teaching code to exclude an assessment. */
export function upcomingAssessments(lessons:Lesson[],today:string,time='00:00'):Lesson[]{
 const unique=new Map<string,Lesson>();
 for(const lesson of lessons){
  if(!assessmentCategory(lesson)||lesson.date<today||(lesson.date===today&&minutes(lesson.end)<=minutes(time)))continue;
  unique.set(`${lesson.scheduleKey}:${lesson.date}:${lesson.sourceId??lesson.id}`,lesson);
 }
 return [...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)||minutes(a.start)-minutes(b.start)||a.title.localeCompare(b.title,'hr'));
}
