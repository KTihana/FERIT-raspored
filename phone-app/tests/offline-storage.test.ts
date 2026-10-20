import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import ts from 'typescript';
import {createOfflineScheduleLoader} from '../lib/offline-schedule.ts';
import {parseSchedule,FERIT_URL} from '../lib/ferit.ts';

type Runtime=Pick<typeof import('../lib/phone-runtime.ts'),'readPhonePreferences'|'savePhonePreferences'|'phonePreferenceKeys'>;
const source=readFileSync(new URL('../lib/phone-runtime.ts',import.meta.url),'utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function runtime(native:Map<string,string>,legacy:Map<string,string>,webviewAvailable=true){
 const modules:Record<string,unknown>={
  '@capacitor/core':{Capacitor:{isNativePlatform:()=>true},CapacitorHttp:{},SystemBars:{},SystemBarsStyle:{}},
  '@capacitor/app':{App:{}},'@capacitor/browser':{Browser:{}},'@capacitor/screen-orientation':{ScreenOrientation:{}},
  '@capacitor/preferences':{Preferences:{get:async({key}:{key:string})=>({value:native.get(key)??null}),set:async({key,value}:{key:string;value:string})=>{native.set(key,value);},keys:async()=>({keys:[...native.keys()]})}},
  './direct-ferit':{createDirectFeritClient:()=>({})},'./app-updates':{},
 };
 const exports:Record<string,unknown>={};
 const webview={get length(){if(!webviewAvailable)throw new Error('WebView storage unavailable');return legacy.size;},key:(i:number)=>[...legacy.keys()][i]??null,getItem:(key:string)=>{if(!webviewAvailable)throw new Error('WebView storage unavailable');return legacy.get(key)??null;},setItem:(key:string,value:string)=>{if(!webviewAvailable)throw new Error('WebView storage unavailable');legacy.set(key,value);}};
 new Script(javascript).runInNewContext({exports,require:(name:string)=>modules[name],localStorage:webview});
 return exports as Runtime;
}
const key='3-53',week='2026-10-12',id=`ferit-week:${key}:${week}`;
const schedule=parseSchedule(readFileSync(new URL('./fixtures/3-53.html',import.meta.url),'utf8'),key,`${FERIT_URL}/${week}/${key}`);
const offline=async()=>{throw new Error('FERIT unavailable');};
const loader=(api:Runtime)=>createOfflineScheduleLoader(offline,{get:api.readPhonePreferences,set:api.savePhonePreferences,keys:api.phonePreferenceKeys});

test('existing WebView weeks migrate to native storage and still work after the WebView cache is cleared',async()=>{
 const native=new Map<string,string>();const legacy=new Map([[id,JSON.stringify(schedule)]]);
 assert.deepEqual((await loader(runtime(native,legacy)).load(key,week)).snapshot.schedule,schedule);
 assert.equal(native.get(id),JSON.stringify(schedule));legacy.clear();
 const reopened=loader(runtime(native,legacy));assert.deepEqual((await reopened.load(key,week)).snapshot.schedule,schedule);
 const fallback=await reopened.load(key,'2026-10-28',{allowLastSaved:true});assert.equal(fallback.snapshot.week,week);assert.equal(fallback.fallback,true);
});

test('native offline weeks remain readable when WebView storage is inaccessible',async()=>{
 const native=new Map([[id,JSON.stringify(schedule)]]);const api=runtime(native,new Map(),false);
 assert.deepEqual((await loader(api).load(key,week)).snapshot.schedule,schedule);
 assert.deepEqual(Array.from(await api.phonePreferenceKeys()),[id]);
 assert.deepEqual((await loader(api).load(key,'2026-10-28',{allowLastSaved:true})).snapshot.schedule,schedule);
});
