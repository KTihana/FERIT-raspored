export const APP_VERSION='1.0.18';
export const GITHUB_RELEASES_API='https://api.github.com/repos/KTihana/FERIT-raspored/releases?per_page=30';

export type AppUpdate={version:string;tag:string;apkUrl:string;releaseUrl:string;notes:string};

const REPOSITORY_URL='https://github.com/KTihana/FERIT-raspored';
const APK_NAME='FERIT-raspored.apk';
const VERSION=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RELEASE_TAG=/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-android-test)?$/;
const FORMAT_ERROR='GitHub je vratio neočekivani format izdanja. Pokušaj ponovno kasnije.';
type NumericVersion=readonly [bigint,bigint,bigint];
type ReleaseAsset={name:string;state:string;size:number;browser_download_url:string};
type Release={tag_name:string;draft:boolean;prerelease:boolean;html_url:string;body?:string|null;assets:ReleaseAsset[]};

function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
function numbers(match:RegExpMatchArray):NumericVersion{return [BigInt(match[1]),BigInt(match[2]),BigInt(match[3])];}
function compare(a:NumericVersion,b:NumericVersion){for(let i=0;i<3;i++){if(a[i]>b[i])return 1;if(a[i]<b[i])return -1;}return 0;}

function matchesTrustedUrl(value:unknown,path:string):value is string{
 if(typeof value!=='string'||value!==REPOSITORY_URL+path)return false;
 try{
  const url=new URL(value);
  return url.protocol==='https:'&&url.hostname==='github.com'&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/KTihana/FERIT-raspored'+path;
 }catch{return false;}
}

// Validate again before handing an APK link to the operating system. Exact raw
// matching prevents URL normalization from accepting traversal or encoded paths.
export function isTrustedApkUrl(value:unknown):value is string{
 if(typeof value!=='string')return false;
 const tag=value.match(/^https:\/\/github\.com\/KTihana\/FERIT-raspored\/releases\/download\/([^/]+)\/FERIT-raspored\.apk$/)?.[1];
 return !!tag&&RELEASE_TAG.test(tag)&&matchesTrustedUrl(value,`/releases/download/${tag}/${APK_NAME}`);
}

function readRelease(value:unknown):Release{
 if(!isRecord(value)||typeof value.tag_name!=='string'||typeof value.draft!=='boolean'||typeof value.prerelease!=='boolean'||typeof value.html_url!=='string'||!Array.isArray(value.assets)||(value.body!==undefined&&value.body!==null&&typeof value.body!=='string'))throw new Error(FORMAT_ERROR);
 for(const asset of value.assets){
  if(!isRecord(asset)||typeof asset.name!=='string'||typeof asset.state!=='string'||typeof asset.size!=='number'||typeof asset.browser_download_url!=='string')throw new Error(FORMAT_ERROR);
 }
 return value as Release;
}

// Releases are deliberately listed rather than using /latest: FERIT's Android
// test builds are published prereleases, which GitHub omits from that endpoint.
export function selectAppUpdate(releases:unknown,currentVersion:string):AppUpdate|null{
 if(!Array.isArray(releases))throw new Error(FORMAT_ERROR);
 const currentMatch=typeof currentVersion==='string'?currentVersion.match(VERSION):null;
 if(!currentMatch)throw new Error('Verziju aplikacije nije moguće pročitati.');
 const current=numbers(currentMatch);
 let chosen:{update:AppUpdate;numeric:NumericVersion;stable:boolean}|null=null;
 for(const value of releases){
  const release=readRelease(value);
  const match=release.tag_name.match(RELEASE_TAG);
  if(release.draft||!match)continue;
  const numeric=numbers(match);
  if(compare(numeric,current)<=0)continue;
  const tag=release.tag_name;
  const releasePath=`/releases/tag/${tag}`;
  if(!matchesTrustedUrl(release.html_url,releasePath))continue;
  const apkPath=`/releases/download/${tag}/${APK_NAME}`;
  const asset=release.assets.find(a=>a.name===APK_NAME&&a.state==='uploaded'&&Number.isSafeInteger(a.size)&&a.size>0&&isTrustedApkUrl(a.browser_download_url)&&matchesTrustedUrl(a.browser_download_url,apkPath));
  if(!asset)continue;
  const stable=!match[4];
  const order=chosen?compare(numeric,chosen.numeric):1;
  if(order<0||(order===0&&(!stable||chosen?.stable)))continue;
  chosen={numeric,stable,update:{version:`${match[1]}.${match[2]}.${match[3]}`,tag,apkUrl:asset.browser_download_url,releaseUrl:REPOSITORY_URL+releasePath,notes:release.body??''}};
 }
 return chosen?.update??null;
}
