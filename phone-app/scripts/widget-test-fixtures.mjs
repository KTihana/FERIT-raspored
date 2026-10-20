import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {parseSchedule,FERIT_URL,monday,ScheduleInPreparationError} from '../lib/ferit.ts';
const root=fileURLToPath(new URL('..',import.meta.url)), fixtures=join(root,'tests/fixtures');
const expected={};
for(const name of (await readdir(fixtures)).filter(n=>n.endsWith('.html'))){
 const key=name.match(/^(\d+-\d+)/)?.[1];
 if(!key)continue;
 const html=await readFile(join(fixtures,name),'utf8');
 let preliminary;
 try{preliminary=parseSchedule(html,key,'');}catch(error){if(error instanceof ScheduleInPreparationError)continue;throw error;}
 const week=preliminary.lessons.length?monday(preliminary.lessons[0].date):null;
 if(!week)continue;
 const schedule=parseSchedule(html,key,`${FERIT_URL}/${week}/${key}`);
 expected[name]={key,week,lessons:schedule.lessons,teachingWeek:schedule.teachingWeek};
}
const out=join(root,'android/app/src/test/resources');
await mkdir(out,{recursive:true});
await writeFile(join(out,'widget-parser-expectations.json'),JSON.stringify(expected,null,2));
console.log(`Generated native parser parity fixtures from ${Object.keys(expected).length} source weeks.`);
