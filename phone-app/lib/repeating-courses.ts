import {applyPersonal,type Lesson,type Override,type ScheduleOption,type Study} from './ferit.ts';

export type RepeatingType={id:string;label:string};
export type RepeatingCourse={scheduleKey:string;courseCode:string;title:string;types?:RepeatingType[];selectedTypes?:string[]};
// `enabled` is read only for compatibility with the first 1.0.15 build.
export type RepeatingSettings={enabled?:boolean;courses:RepeatingCourse[]};
export const EMPTY_REPEATING:RepeatingSettings={courses:[]};

/** Only the immediately preceding year within the selected programme is eligible. */
export function repeatingYearOptions(studies:Study[],key:string):ScheduleOption[]{
 const study=studies.find(s=>s.options.some(o=>o.key===key));
 const current=study?.options.find(o=>o.key===key);
 return current&&!current.exam?study!.options.filter(o=>o.year===current.year-1&&!o.exam&&!o.legacy):[];
}

export function repeatingCourseId(course:RepeatingCourse):string{
 return `${course.scheduleKey}:${course.courseCode||course.title}`;
}

export function repeatingLessonType(lesson:Pick<Lesson,'type'|'typeLabel'>):string{
 return lesson.type==='OSTALO'?`OSTALO:${lesson.typeLabel}`:lesson.type;
}

/** Discover choices only from actual published occurrences, across available weeks. */
export function mergeRepeatingCourses(known:RepeatingCourse[],lessons:Lesson[]):RepeatingCourse[]{
 const courses=new Map<string,RepeatingCourse>();
 for(const course of [...known,...lessons.filter(l=>!l.personal).map(l=>({scheduleKey:l.scheduleKey,courseCode:l.courseCode,title:l.title,types:[{id:repeatingLessonType(l),label:l.typeLabel||l.type}]}))]){
  const id=repeatingCourseId(course),previous=courses.get(id);
  const types=new Map<string,RepeatingType>();
  for(const type of [...(previous?.types??[]),...(course.types??[])])types.set(type.id,type);
  courses.set(id,{...previous,...course,types:[...types.values()].sort((a,b)=>a.label.localeCompare(b.label,'hr'))});
 }
 return [...courses.values()].sort((a,b)=>a.title.localeCompare(b.title,'hr')||a.scheduleKey.localeCompare(b.scheduleKey));
}

export function activeRepeatingCourses(studies:Study[],key:string,settings?:RepeatingSettings):RepeatingCourse[]{
 if(!settings||settings.enabled===false)return [];
 const allowed=new Set(repeatingYearOptions(studies,key).map(o=>o.key));
 return mergeRepeatingCourses((settings.courses??[]).filter(c=>allowed.has(c.scheduleKey)&&c.selectedTypes?.length!==0),[]);
}

/** Keep each source's identity so edits, removals and LV choices survive refreshes. */
export function combinedPersonalSchedule(source:Lesson[],overrides:Record<string,Override>,personal:Lesson[],key:string,courses:RepeatingCourse[]):Lesson[]{
 const result=applyPersonal(source.filter(l=>l.scheduleKey===key),overrides,personal,key);
 const selected=new Map(courses.map(c=>[repeatingCourseId(c),c]));
 for(const extraKey of new Set(courses.map(c=>c.scheduleKey))){
  if(extraKey===key)continue;
  const lessons=applyPersonal(source.filter(l=>l.scheduleKey===extraKey),overrides,[],extraKey);
  result.push(...lessons.filter(l=>{
   const course=selected.get(repeatingCourseId(overrides[l.id]?.original??l));
   return course&&(!course.selectedTypes||course.selectedTypes.includes(repeatingLessonType(l)));
  }).map(l=>({...l,repeatingYear:Number(extraKey.split('-')[0])})));
 }
 return result.sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
}
