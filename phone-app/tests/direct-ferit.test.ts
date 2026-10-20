import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDirectFeritClient} from '../lib/direct-ferit.ts';
import {FERIT_URL} from '../lib/ferit.ts';
const html=readFileSync(new URL('./fixtures/3-53.html',import.meta.url),'utf8');

test('phone data comes directly from FERIT and preserves LV3 metadata',async()=>{
 const requests:string[]=[];
 const client=createDirectFeritClient(async url=>{requests.push(url);return html;});
 assert.equal((await client.catalogue()).studies.length,16);
 const week=await client.schedule('3-53','2026-10-13');
 const lv3=week.lessons.find(l=>l.group==='SR-LV3')!;
 assert.equal(lv3.teacher,'BOŠNJAK ANDREJ');
 assert.equal(lv3.start,'08:00');
 assert.deepEqual(requests,[FERIT_URL,FERIT_URL+'/2026-10-12/3-53']);
 await client.schedule('3-53','2026-10-14');
 assert.equal(requests.length,2);
});
test('direct group lookup keeps successful weeks when another request fails',async()=>{
 const client=createDirectFeritClient(async url=>{if(url.includes('/2026-10-05/'))throw new Error('offline');return html;});
 const groups=await client.groups('3-53','2026-10-13');
 assert.equal(groups.partial,true);
 assert.ok(groups.courses.every(c=>c.groups.includes('SR-LV3')));
});
test('a different week returned by FERIT cannot be shown for the requested date',async()=>{
 const client=createDirectFeritClient(async()=>html);
 await assert.rejects(client.schedule('3-53','2026-10-20'),/drugi tjedan/);
});
test('invalid routes and abandoned requests do not update native results',async()=>{
 let requests=0;
 const client=createDirectFeritClient(async()=>{requests++;return html;});
 await assert.rejects(client.schedule('../api','2026-10-13'));
 await assert.rejects(client.schedule('3-53','2026-02-30'));
 assert.equal(requests,0);
 const c=new AbortController();c.abort();
 await assert.rejects(client.catalogue(c.signal),{name:'AbortError'});
 assert.equal(requests,0);
 const cancelled=createDirectFeritClient(async()=>{const controller=delayed;controller.abort();return html;});
 const delayed=new AbortController();
 await assert.rejects(cancelled.schedule('3-53','2026-10-13',delayed.signal),{name:'AbortError'});
});

test('a timetable refresh checks FERIT even if the in-memory HTML is still cached',async()=>{
 let available=true;let requests=0;const client=createDirectFeritClient(async()=>{requests++;if(!available)throw new Error('FERIT down');return html;});
 await client.schedule('3-53','2026-10-13');available=false;
 await assert.rejects(client.freshSchedule('3-53','2026-10-13'),/FERIT down/);assert.equal(requests,2);
 available=true;await client.freshSchedule('3-53','2026-10-13');assert.equal(requests,3);
});
