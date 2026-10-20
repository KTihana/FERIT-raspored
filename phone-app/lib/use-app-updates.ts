import {useCallback,useEffect,useRef,useState} from 'react';
import {APP_VERSION,selectAppUpdate,type AppUpdate} from './app-updates';
import {appUpdatePlatform,installedAppVersion,fetchAppReleases,onPhoneResume,openAppUpdate} from './phone-runtime';

const CACHE='ferit-app-update-v1';
const DISMISSED='ferit-app-update-dismissed-v1';
const ATTEMPT='ferit-app-update-attempt-v1';
const FAILURE_BACKOFF=10*60*1000;
const CHECK_INTERVAL=60*60*1000;
type Status='idle'|'checking'|'current'|'available'|'error'|'unsupported';
export type AppUpdateState={status:Status;platform:'android'|'ios'|'web';version:string;update:AppUpdate|null;checkedAt:number|null;message:string;dismissed:string};
const initial:AppUpdateState={status:'idle',platform:'web',version:APP_VERSION,update:null,checkedAt:null,message:'',dismissed:''};

export function useAppUpdates(enabled:boolean){
 const [state,setState]=useState<AppUpdateState>(initial);
 const active=useRef(false);const inFlight=useRef(false);const controller=useRef<AbortController|null>(null);
 const check=useCallback(async(manual=false)=>{
  if(!active.current||inFlight.current)return;
  const platform=appUpdatePlatform();
  if(platform==='ios'){
   let version='';try{version=await installedAppVersion();}catch{}
   if(active.current)setState(s=>({...s,status:'unsupported',platform,version,update:null,message:'Ažuriranja za iPhone još nisu dostupna.'}));
   return;
  }
  inFlight.current=true;const request=new AbortController();controller.current=request;
  let version=APP_VERSION;
  try{
   version=await installedAppVersion();if(!active.current||request.signal.aborted)return;
   let dismissed='';try{dismissed=localStorage.getItem(DISMISSED)??'';}catch{}
   let cached:{checkedAt:number;releases:unknown}|null=null;
   try{
    const saved=JSON.parse(localStorage.getItem(CACHE)??'null');
    if(saved?.version===version&&typeof saved.checkedAt==='number'&&saved.checkedAt>0&&saved.checkedAt<=Date.now()){
     const update=selectAppUpdate(saved.releases,version);cached=saved;
     setState(s=>({...s,platform,version,status:update?'available':'current',update,checkedAt:saved.checkedAt,message:'',dismissed}));
    }
   }catch{}
   if(!manual&&cached&&Date.now()-cached.checkedAt<CHECK_INTERVAL)return;
   if(!manual){
    try{const attempt=JSON.parse(localStorage.getItem(ATTEMPT)??'null');if(attempt?.version===version&&attempt.failed===true&&typeof attempt.attemptedAt==='number'&&attempt.attemptedAt<=Date.now()&&Date.now()-attempt.attemptedAt<FAILURE_BACKOFF){setState(s=>({...s,platform,version,status:'error',dismissed,message:typeof attempt.message==='string'?attempt.message:'Ažuriranja trenutno nije moguće provjeriti.'}));return;}}catch{}
   }
   try{localStorage.setItem(ATTEMPT,JSON.stringify({version,attemptedAt:Date.now(),failed:false}));}catch{}
   setState(s=>({...s,platform,version,status:'checking',message:'',dismissed}));
   const releases=await fetchAppReleases(request.signal);
   if(!active.current||request.signal.aborted)return;
   const update=selectAppUpdate(releases,version);const checkedAt=Date.now();
   try{localStorage.setItem(CACHE,JSON.stringify({version,checkedAt,releases}));}catch{}
   setState(s=>({...s,platform,version,status:update?'available':'current',update,checkedAt,message:''}));
  }catch(error){
   if(active.current&&!request.signal.aborted){const message=error instanceof Error?error.message:'Ažuriranja trenutno nije moguće provjeriti.';try{localStorage.setItem(ATTEMPT,JSON.stringify({version,attemptedAt:Date.now(),failed:true,message}));}catch{}setState(s=>({...s,platform,version,status:'error',message}));}
  }finally{
   if(controller.current===request){controller.current=null;inFlight.current=false;}
  }
 },[]);
 useEffect(()=>{
  if(!enabled)return;
  active.current=true;void check();
  const wake=()=>{if(document.visibilityState==='visible')void check();};
  const pageshow=(event:PageTransitionEvent)=>{if(event.persisted)void check();};
  document.addEventListener('visibilitychange',wake);window.addEventListener('pageshow',pageshow);
  const stopResume=onPhoneResume(()=>{void check();});
  return()=>{active.current=false;const pending=controller.current;controller.current=null;inFlight.current=false;pending?.abort();stopResume();document.removeEventListener('visibilitychange',wake);window.removeEventListener('pageshow',pageshow);};
 },[enabled,check]);
 const dismiss=useCallback(()=>{
  const version=state.update?.version;if(!version)return;
  try{localStorage.setItem(DISMISSED,version);}catch{}
  setState(s=>({...s,dismissed:version}));
 },[state.update]);
 const download=useCallback(async()=>{
  if(!state.update)return;
  try{await openAppUpdate(state.update.apkUrl);}catch{const message='Preuzimanje nije moguće otvoriti. Pokušaj ponovno.';setState(s=>({...s,message}));throw new Error(message);}
 },[state.update]);
 return {...state,check:()=>check(true),download,dismiss,showNotice:!!state.update&&state.dismissed!==state.update.version};
}
