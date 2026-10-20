import {Capacitor,CapacitorHttp,SystemBars,SystemBarsStyle,registerPlugin} from '@capacitor/core';
import {Preferences} from '@capacitor/preferences';
import {App} from '@capacitor/app';
import {Browser} from '@capacitor/browser';
import {ScreenOrientation} from '@capacitor/screen-orientation';
import {createDirectFeritClient} from './direct-ferit';
import {APP_VERSION,GITHUB_RELEASES_API,isTrustedApkUrl} from './app-updates';

export const isPhoneApp=()=>Capacitor.isNativePlatform();
export const supportsHomeWidget=()=>Capacitor.getPlatform()==='android';
export async function addHomeWidget(){
 if(!supportsHomeWidget())return false;
 const widget=registerPlugin<{pin:()=>Promise<{requested:boolean}>}>('ScheduleWidget');
 return (await widget.pin()).requested;
}
const direct=createDirectFeritClient(async url=>{
 const response=await CapacitorHttp.get({url,headers:{Accept:'text/html'},responseType:'text',connectTimeout:15000,readTimeout:15000});
 if(response.status<200||response.status>=300||typeof response.data!=='string')throw new Error('FERIT trenutno nije dostupan.');
 return response.data;
});
export const scheduleClient={...direct,schedule:direct.freshSchedule};
export async function phoneTheme(theme:'light'|'dark'){
 if(isPhoneApp())await SystemBars.setStyle({style:theme==='dark'?SystemBarsStyle.Dark:SystemBarsStyle.Light});
}
export async function phoneOrientation(orientation:'portrait'|'landscape'|'auto'){
 if(!isPhoneApp())return;
 // Unlock follows the system's auto-rotation preference instead of forcing a sensor lock.
 if(orientation==='auto')await ScreenOrientation.unlock();
 else await ScreenOrientation.lock({orientation});
}
export function onPhoneResume(callback:()=>void):()=>void{
 if(!isPhoneApp())return()=>{};
 let disposed=false;
 const handle=App.addListener('appStateChange',state=>{if(state.isActive&&!disposed)callback();});
 return()=>{disposed=true;void handle.then(h=>h.remove());};
}

export async function readPhonePreferences(key:string){
 if(isPhoneApp()){try{const saved=await Preferences.get({key});if(saved.value)return saved.value;}catch{}}
 return localStorage.getItem(key);
}
export async function savePhonePreferences(key:string,value:string){
 if(isPhoneApp())await Preferences.set({key,value});
 try{localStorage.setItem(key,value);}catch{if(!isPhoneApp())throw new Error('Spremanje nije dostupno.');}
}

export async function phonePreferenceKeys(){
 const keys=new Set<string>();
 if(isPhoneApp()){try{for(const key of (await Preferences.keys()).keys)keys.add(key);}catch{}}
 try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key)keys.add(key);}}catch{}
 return [...keys];
}

export function appUpdatePlatform():'android'|'ios'|'web'{
 const platform=Capacitor.getPlatform();
 return platform==='android'||platform==='ios'?platform:'web';
}

export async function installedAppVersion():Promise<string>{
 if(appUpdatePlatform()==='web')return APP_VERSION;
 const info=await App.getInfo();
 if(typeof info.version!=='string'||!info.version.trim())throw new Error('Verziju instalirane aplikacije nije moguće provjeriti.');
 return info.version.trim();
}

class ReleaseCheckError extends Error {
 constructor(message:string){super(message);this.name='ReleaseCheckError';}
}
const cancelledUpdateCheck=()=>new DOMException('Provjera je otkazana.','AbortError');
function requireReleaseResponse(status:number){
 if(status===403||status===429)throw new ReleaseCheckError('GitHub je privremeno ograničio provjere. Pokušaj ponovno kasnije.');
 if(!(status>=200&&status<300))throw new ReleaseCheckError('Provjera ažuriranja trenutačno nije dostupna. Pokušaj ponovno.');
}
function releaseJson(data:unknown):unknown{
 if(typeof data==='string'){
  try{return JSON.parse(data);}catch{throw new ReleaseCheckError('Odgovor GitHuba nije moguće pročitati. Pokušaj ponovno.');}
 }
 if(data===undefined)throw new ReleaseCheckError('Odgovor GitHuba nije moguće pročitati. Pokušaj ponovno.');
 return data;
}

export async function fetchAppReleases(signal?:AbortSignal):Promise<unknown>{
 if(signal?.aborted)throw cancelledUpdateCheck();
 if(isPhoneApp()){
  let response;
  try{
   response=await CapacitorHttp.get({url:GITHUB_RELEASES_API,headers:{Accept:'application/vnd.github+json'},responseType:'json',connectTimeout:10000,readTimeout:10000});
  }catch{
   if(signal?.aborted)throw cancelledUpdateCheck();
   throw new ReleaseCheckError('Provjera ažuriranja nije dostupna. Provjeri vezu i pokušaj ponovno.');
  }
  // Capacitor HTTP has no cancellation signal; never use a response after cancellation.
  if(signal?.aborted)throw cancelledUpdateCheck();
  requireReleaseResponse(response.status);
  return releaseJson(response.data);
 }
 const controller=new AbortController();let timedOut=false;
 const cancel=()=>controller.abort(signal?.reason);
 signal?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},10000);
 try{
  const response=await fetch(GITHUB_RELEASES_API,{headers:{Accept:'application/vnd.github+json'},cache:'no-store',mode:'cors',credentials:'omit',signal:controller.signal});
  requireReleaseResponse(response.status);
  let data:unknown;
  try{data=await response.json();}catch(error){
   if(controller.signal.aborted)throw error;
   throw new ReleaseCheckError('Odgovor GitHuba nije moguće pročitati. Pokušaj ponovno.');
  }
  if(signal?.aborted)throw cancelledUpdateCheck();
  return data;
 }catch(error){
  if(signal?.aborted)throw cancelledUpdateCheck();
  if(timedOut)throw new ReleaseCheckError('Provjera ažuriranja traje predugo. Pokušaj ponovno.');
  if(error instanceof ReleaseCheckError)throw error;
  throw new ReleaseCheckError('Provjera ažuriranja nije dostupna. Provjeri vezu i pokušaj ponovno.');
 }finally{
  clearTimeout(timer);signal?.removeEventListener('abort',cancel);
 }
}

export async function openAppUpdate(apkUrl:string):Promise<void>{
 if(!isTrustedApkUrl(apkUrl))throw new Error('Poveznica za ažuriranje nije valjana.');
 if(isPhoneApp())await Browser.open({url:apkUrl});
 else window.open(apkUrl,'_blank','noopener,noreferrer');
}
