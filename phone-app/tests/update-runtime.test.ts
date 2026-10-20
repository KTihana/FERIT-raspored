import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import ts from 'typescript';
import * as appUpdates from '../lib/app-updates.ts';

type Runtime=Pick<typeof import('../lib/phone-runtime.ts'),'appUpdatePlatform'|'installedAppVersion'|'fetchAppReleases'|'openAppUpdate'>;
type NativeResponse={status:number;data:unknown};
type Options={native?:boolean;platform?:'android'|'ios'|'web';version?:unknown;fetch?:typeof fetch;nativeHttp?:(request:Record<string,unknown>)=>Promise<NativeResponse>;setTimer?:(callback:()=>void,delay:number)=>unknown;clearTimer?:(timer:unknown)=>void};

// Execute the actual runtime with isolated transport / OS adapters. No test can
// contact GitHub, FERIT, a browser or an installer, and no global mocks leak.
const source=readFileSync(new URL('../lib/phone-runtime.ts',import.meta.url),'utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function runtime(options:Options={}){
 const opened:{web:unknown[][];native:unknown[]}={web:[],native:[]};let infoCalls=0;
 const modules:Record<string,unknown>={
  '@capacitor/core':{Capacitor:{isNativePlatform:()=>!!options.native,getPlatform:()=>options.platform??(options.native?'android':'web')},CapacitorHttp:{get:options.nativeHttp??(()=>{throw new Error('Unexpected native HTTP request');})},SystemBars:{},SystemBarsStyle:{}},
  '@capacitor/app':{App:{getInfo:async()=>{infoCalls++;return {version:Object.hasOwn(options,'version')?options.version:appUpdates.APP_VERSION};}}},
  '@capacitor/browser':{Browser:{open:async(value:unknown)=>{opened.native.push(value);}}},
  '@capacitor/preferences':{Preferences:{}},
  '@capacitor/screen-orientation':{ScreenOrientation:{}},
  './direct-ferit':{createDirectFeritClient:()=>({})},
  './app-updates':appUpdates,
 };
 const exports:Record<string,unknown>={};
 new Script(javascript,{filename:'phone-runtime.test-module.js'}).runInNewContext({
  exports,
  require:(name:string)=>{if(!Object.hasOwn(modules,name))throw new Error('Unexpected import: '+name);return modules[name];},
  fetch:options.fetch??(()=>{throw new Error('Unexpected web HTTP request');}),
  AbortController,DOMException,
  setTimeout:options.setTimer??setTimeout,clearTimeout:options.clearTimer??clearTimeout,
  window:{open:(...args:unknown[])=>{opened.web.push(args);return null;}},
 });
 return {api:exports as Runtime,opened,infoCalls:()=>infoCalls};
}
const tag='v1.0.7-android-test';
// This release is newer than our fixture installation, independent of APP_VERSION.
const installedFixtureVersion='1.0.6';
const apkUrl='https://github.com/KTihana/FERIT-raspored/releases/download/'+tag+'/FERIT-raspored.apk';
const releases=[{tag_name:tag,draft:false,prerelease:true,html_url:'https://github.com/KTihana/FERIT-raspored/releases/tag/'+tag,assets:[{name:'FERIT-raspored.apk',state:'uploaded',size:1,browser_download_url:apkUrl}]}];

test('web version uses the bundled version without calling a native plugin',async()=>{
 const r=runtime();assert.equal(r.api.appUpdatePlatform(),'web');
 assert.equal(await r.api.installedAppVersion(),appUpdates.APP_VERSION);assert.equal(r.infoCalls(),0);
});

test('web release transport is public, bypasses cache and feeds the release selector',async()=>{
 let input:RequestInfo|URL|undefined;let init:RequestInit|undefined;
 const r=runtime({fetch:async(url,options)=>{input=url;init=options;return new Response(JSON.stringify(releases),{status:200});}});
 const payload=await r.api.fetchAppReleases();
 assert.equal(input,appUpdates.GITHUB_RELEASES_API);assert.equal(init?.credentials,'omit');assert.equal(init?.cache,'no-store');assert.equal(init?.mode,'cors');
 assert.equal(new Headers(init?.headers).get('Accept'),'application/vnd.github+json');assert.equal(new Headers(init?.headers).has('Authorization'),false);
 assert.ok(init?.signal instanceof AbortSignal);
 assert.equal(appUpdates.selectAppUpdate(payload,installedFixtureVersion)?.apkUrl,apkUrl);
});

test('HTTP rate limits and server failures reject instead of producing an up-to-date result',async()=>{
 for(const status of [403,429,500]){
  const r=runtime({fetch:async()=>new Response('{"message":"unavailable"}',{status})});
  await assert.rejects(r.api.fetchAppReleases(),status===500?/trenutačno nije dostupna/:/privremeno ograničio/);
 }
});

test('invalid JSON and an offline transport are reported as failed checks',async()=>{
 const malformed=runtime({fetch:async()=>new Response('<html>not JSON</html>',{status:200})});
 await assert.rejects(malformed.api.fetchAppReleases(),/Odgovor GitHuba nije moguće pročitati/);
 const offline=runtime({fetch:async()=>{throw new TypeError('offline');}});
 await assert.rejects(offline.api.fetchAppReleases(),/Provjeri vezu/);
});

test('caller cancellation prevents a request or cancels an in-flight web fetch',async()=>{
 let calls=0;let clears=0;
 const r=runtime({setTimer:()=>1,clearTimer:()=>{clears++;},fetch:(_url,init)=>{calls++;return new Promise((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});});}});
 const prior=new AbortController();prior.abort();await assert.rejects(r.api.fetchAppReleases(prior.signal),{name:'AbortError'});assert.equal(calls,0);
 const pending=new AbortController();const check=r.api.fetchAppReleases(pending.signal);pending.abort();
 await assert.rejects(check,{name:'AbortError'});assert.equal(calls,1);assert.equal(clears,1);
});

test('the web deadline aborts the transport and reports a timeout without waiting ten seconds',async()=>{
 let expire:(()=>void)|undefined;let cleared=false;let requestSignal:AbortSignal|null|undefined;
 const r=runtime({setTimer:(callback,delay)=>{assert.equal(delay,10000);expire=callback;return 7;},clearTimer:timer=>{assert.equal(timer,7);cleared=true;},fetch:(_url,init)=>{requestSignal=init?.signal;return new Promise((_resolve,reject)=>{requestSignal?.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError')),{once:true});});}});
 const check=r.api.fetchAppReleases();assert.ok(expire);expire();
 await assert.rejects(check,/traje predugo/);assert.equal(requestSignal?.aborted,true);assert.equal(cleared,true);
});

test('untrusted APK paths never reach either browser-opening adapter',async()=>{
 for(const native of [false,true]){
  const r=runtime({native});
  for(const url of ['https://github.com/elsewhere/FERIT-raspored/releases/download/v9.0.0/FERIT-raspored.apk',apkUrl.replace('/releases/','/x/../releases/')])await assert.rejects(r.api.openAppUpdate(url),/Poveznica.*nije valjana/);
  assert.equal(r.opened.web.length,0);assert.equal(r.opened.native.length,0);
 }
});

test('a trusted APK opens with safe web flags or the native Browser plugin',async()=>{
 const web=runtime();await web.api.openAppUpdate(apkUrl);assert.deepEqual(web.opened.web,[[apkUrl,'_blank','noopener,noreferrer']]);assert.equal(web.opened.native.length,0);
 const native=runtime({native:true});await native.api.openAppUpdate(apkUrl);assert.equal(native.opened.native.length,1);assert.equal((native.opened.native[0] as {url:string}).url,apkUrl);assert.equal(native.opened.web.length,0);
});

test('native HTTP accepts JSON text or objects with bounded timeouts, and ignores cancelled results',async()=>{
 for(const data of [releases,JSON.stringify(releases)]){
  const r=runtime({native:true,nativeHttp:async request=>{assert.equal(request.url,appUpdates.GITHUB_RELEASES_API);assert.equal(request.responseType,'json');assert.equal(request.connectTimeout,10000);assert.equal(request.readTimeout,10000);return {status:200,data};}});
  assert.equal(appUpdates.selectAppUpdate(await r.api.fetchAppReleases(),installedFixtureVersion)?.version,'1.0.7');
 }
 let complete:((response:NativeResponse)=>void)|undefined;
 const r=runtime({native:true,nativeHttp:()=>new Promise(resolve=>{complete=resolve;})});
 const controller=new AbortController();const check=r.api.fetchAppReleases(controller.signal);controller.abort();assert.ok(complete);complete({status:200,data:releases});
 await assert.rejects(check,{name:'AbortError'});
});

test('native installed version comes from App.getInfo and missing values cannot imply current',async()=>{
 const r=runtime({native:true,platform:'ios',version:'1.0.5'});assert.equal(r.api.appUpdatePlatform(),'ios');assert.equal(await r.api.installedAppVersion(),'1.0.5');assert.equal(r.infoCalls(),1);
 for(const version of ['',undefined,4])await assert.rejects(runtime({native:true,version}).api.installedAppVersion(),/Verziju instalirane aplikacije/);
});
