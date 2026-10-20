import {FERIT_URL,parseCatalogue,parseSchedule,mergeLabCourses,addDays,monday} from './ferit.ts';

export type HtmlReader=(url:string)=>Promise<string>;
export function createDirectFeritClient(readHtml:HtmlReader){
 const cache=new Map<string,{html:string;expires:number}>();
 async function read(path:string,signal?:AbortSignal,force=false){
  signal?.throwIfAborted();const url=FERIT_URL+path;const cached=cache.get(url);
  const html=!force&&cached&&cached.expires>Date.now()?cached.html:await readHtml(url);
  signal?.throwIfAborted();if(cache.size>100)cache.clear();cache.set(url,{html,expires:Date.now()+60000});return html;
 }
 function validate(key:string,date:string){
  if(!/^\d+-\d+$/.test(key)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Neispravan datum ili studij.');
 }
 async function schedule(key:string,date:string,signal?:AbortSignal,force=false){
  validate(key,date);const path=`/${monday(date)}/${key}`;
  const result=parseSchedule(await read(path,signal,force),key,FERIT_URL+path);
  if(result.lessons.some(l=>monday(l.date)!==monday(date)))throw new Error('FERIT je vratio drugi tjedan. Odabrani tjedan trenutno nije dostupan.');
  return result;
 }
 return {
  catalogue:async(signal?:AbortSignal)=>({studies:parseCatalogue(await read('',signal))}),
  schedule,
  freshSchedule:(key:string,date:string,signal?:AbortSignal)=>schedule(key,date,signal,true),
  groups:async(key:string,date:string,signal?:AbortSignal)=>{
   validate(key,date);const week=monday(date);
   const results=await Promise.allSettled([-2,-1,0,1,2].map(offset=>schedule(key,addDays(week,offset*7),signal)));
   signal?.throwIfAborted();if(results.every(r=>r.status==='rejected'))throw new Error('Grupe trenutno nije moguće provjeriti.');
   return {courses:mergeLabCourses([],results.flatMap(r=>r.status==='fulfilled'?r.value.lessons:[])),partial:results.some(r=>r.status==='rejected')};
  }
 };
}
