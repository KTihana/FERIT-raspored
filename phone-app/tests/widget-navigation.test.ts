import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import ts from 'typescript';

type Runtime=Pick<typeof import('../lib/phone-runtime.ts'),'widgetDateFromUrl'|'onWidgetOpen'>;
const javascript=ts.transpileModule(readFileSync(new URL('../lib/phone-runtime.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function runtime(platform='android',launchUrl?:string){
 let listener:((event:{url:string})=>void)|undefined;let removed=false;let nativeCalls=0;
 const modules:Record<string,unknown>={
  '@capacitor/core':{Capacitor:{getPlatform:()=>platform},CapacitorHttp:{},SystemBars:{},SystemBarsStyle:{}},
  '@capacitor/app':{App:{getLaunchUrl:async()=>{nativeCalls++;return launchUrl?{url:launchUrl}:undefined;},addListener:async(_event:string,callback:typeof listener)=>{nativeCalls++;listener=callback;return {remove:async()=>{removed=true;}};}}},
  '@capacitor/browser':{Browser:{}},'@capacitor/preferences':{Preferences:{}},'@capacitor/screen-orientation':{ScreenOrientation:{}},
  './direct-ferit':{createDirectFeritClient:()=>({})},'./app-updates':{},
 };
 const exports:Record<string,unknown>={};
 new Script(javascript).runInNewContext({exports,require:(key:string)=>modules[key]});
 return {api:exports as Runtime,emit:(url:string)=>listener?.({url}),removed:()=>removed,calls:()=>nativeCalls};
}
test('widget links accept real dates and reject malformed dates or unrelated links',()=>{
 const {api}=runtime();
 for(const date of ['2026-10-21','2028-02-29','2027-01-01'])assert.equal(api.widgetDateFromUrl('ferit://widget/'+date),date);
 for(const value of [undefined,null,12,'ferit://widget/2026-02-29','ferit://widget/2026-13-01','ferit://widget/2026-04-31','ferit://widget/2026-10-21?other=1','ferit://other/2026-10-21','https://widget/2026-10-21'])assert.equal(api.widgetDateFromUrl(value),null);
});
test('cold and warm widget opens deliver the selected day and stop after disposal',async()=>{
 const r=runtime('android','ferit://widget/2026-10-21');const dates:string[]=[];
 const stop=r.api.onWidgetOpen(date=>dates.push(date));
 await Promise.resolve();assert.deepEqual(dates,['2026-10-21']);
 r.emit('ferit://widget/2026-10-20');r.emit('https://unrelated.example');
 assert.deepEqual(dates,['2026-10-21','2026-10-20']);
 stop();r.emit('ferit://widget/2026-10-22');await Promise.resolve();
 assert.equal(dates.length,2);assert.equal(r.removed(),true);
});
test('widget launch listeners make no native calls on web or iPhone',()=>{
 for(const platform of ['web','ios']){
  const r=runtime(platform);r.api.onWidgetOpen(()=>assert.fail('Unexpected widget launch'))();assert.equal(r.calls(),0);
 }
});

test('native widget colors match the light and dark timetable palettes exactly',()=>{
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 const native=readFileSync(new URL('../android/app/src/main/res/values/widget_palette.xml',import.meta.url),'utf8');
 const themes=[css.match(/:root\s*\{([^}]+)\}/)?.[1],css.match(/:root\[data-theme='dark'\]\s*\{([^}]+)\}/)?.[1]];
 for(const [index,theme] of ['light','dark'].entries())for(const type of ['lab','lecture','exercise','personal']){
  for(const [suffix,variable] of [['fill',type],['rail',type+'-rail']]){
   const expected=themes[index]?.match(new RegExp('--'+variable+':\\s*(#[a-fA-F0-9]{6})'))?.[1];
   assert(expected,'Missing timetable color '+variable);
   assert(native.includes(`<color name="widget_${type}_${theme}_${suffix}">${expected}</color>`),`${type} ${theme} must match schedule ${variable}`);
  }
 }
});
