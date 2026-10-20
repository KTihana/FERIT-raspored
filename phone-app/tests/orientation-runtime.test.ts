import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import ts from 'typescript';

type Runtime=Pick<typeof import('../lib/phone-runtime.ts'),'phoneOrientation'>;
const source=readFileSync(new URL('../lib/phone-runtime.ts',import.meta.url),'utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function orientationRuntime(native:boolean,unlockError?:Error){
 const requests:string[]=[];
 const modules:Record<string,unknown>={
  '@capacitor/core':{Capacitor:{isNativePlatform:()=>native},CapacitorHttp:{},SystemBars:{},SystemBarsStyle:{}},
  '@capacitor/app':{App:{}},'@capacitor/browser':{Browser:{}},'@capacitor/preferences':{Preferences:{}},
  '@capacitor/screen-orientation':{ScreenOrientation:{
   unlock:async()=>{requests.push('unlock');if(unlockError)throw unlockError;},
   lock:async({orientation}:{orientation:string})=>{requests.push(orientation);},
  }},
  './direct-ferit':{createDirectFeritClient:()=>({})},'./app-updates':{},
 };
 const exports:Record<string,unknown>={};
 new Script(javascript,{filename:'orientation-runtime.test-module.js'}).runInNewContext({
  exports,require:(name:string)=>{if(!Object.hasOwn(modules,name))throw new Error('Unexpected import: '+name);return modules[name];},
 });
 return {api:exports as Runtime,requests};
}

test('automatic native orientation releases an existing lock instead of forcing device sensors',async()=>{
 const runtime=orientationRuntime(true);
 await runtime.api.phoneOrientation('auto');
 assert.deepEqual(runtime.requests,['unlock']);
});

test('orientation requests on the web leave browser rotation to the browser',async()=>{
 const runtime=orientationRuntime(false);
 for(const mode of ['auto','portrait','landscape'] as const)await runtime.api.phoneOrientation(mode);
 assert.deepEqual(runtime.requests,[]);
});

test('explicit native locks remain available without changing automatic mode',async()=>{
 const runtime=orientationRuntime(true);
 await runtime.api.phoneOrientation('landscape');
 await runtime.api.phoneOrientation('portrait');
 await runtime.api.phoneOrientation('auto');
 assert.deepEqual(runtime.requests,['landscape','portrait','unlock']);
});

test('a failed native unlock is reported to the caller rather than forcing portrait',async()=>{
 const failure=new Error('orientation unavailable');
 const runtime=orientationRuntime(true,failure);
 await assert.rejects(runtime.api.phoneOrientation('auto'),failure);
 assert.deepEqual(runtime.requests,['unlock']);
});
