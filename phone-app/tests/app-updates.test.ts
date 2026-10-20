import {test} from 'node:test';
import assert from 'node:assert/strict';
import {APP_VERSION,GITHUB_RELEASES_API,isTrustedApkUrl,selectAppUpdate} from '../lib/app-updates.ts';

const REPO='https://github.com/KTihana/FERIT-raspored';
const apk=(tag:string)=>`${REPO}/releases/download/${tag}/FERIT-raspored.apk`;
const page=(tag:string)=>`${REPO}/releases/tag/${tag}`;
const asset=(tag:string,patch:Record<string,unknown>={})=>({name:'FERIT-raspored.apk',state:'uploaded',size:4_900_000,browser_download_url:apk(tag),...patch});
const release=(tag:string,patch:Record<string,unknown>={})=>({tag_name:tag,draft:false,prerelease:tag.endsWith('-android-test'),html_url:page(tag),body:'Promjene u rasporedu.',assets:[asset(tag)],...patch});
// Keep release-comparison fixtures fixed when the app itself is versioned.
const installedFixtureVersion='1.0.6';

test('published Android test prereleases remain discoverable without /latest',()=>{
 const tag='v1.0.7-android-test';
 assert.match(APP_VERSION,/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
 assert.equal(GITHUB_RELEASES_API,'https://api.github.com/repos/KTihana/FERIT-raspored/releases?per_page=30');
 assert.deepEqual(selectAppUpdate([release(tag)],installedFixtureVersion),{version:'1.0.7',tag,apkUrl:apk(tag),releaseUrl:page(tag),notes:'Promjene u rasporedu.'});
});

test('stable releases with the exact uploaded APK are also supported',()=>{
 const tag='v2.0.0';
 const result=selectAppUpdate([release(tag,{body:null})],'1.0.6');
 assert.equal(result?.version,'2.0.0');assert.equal(result?.notes,'');assert.equal(result?.releaseUrl,page(tag));
});

test('numeric versions win over list order and publication dates',()=>{
 const releases=[release('v1.0.9-android-test',{published_at:'2099-01-01T00:00:00Z'}),release('v1.0.10-android-test',{published_at:'2026-01-01T00:00:00Z'}),release('v1.0.8-android-test')];
 assert.equal(selectAppUpdate(releases,'1.0.6')?.version,'1.0.10');
 assert.equal(selectAppUpdate([...releases].reverse(),'1.0.6')?.version,'1.0.10');
 assert.equal(selectAppUpdate([release('v1.99.99'),release('v2.0.0'),release('v1.100.0')],'1.0.6')?.version,'2.0.0');
});

test('equal and older versions never propose reinstalling or downgrading',()=>{
 assert.equal(selectAppUpdate([release('v1.0.6-android-test'),release('v1.0.6'),release('v1.0.5-android-test'),release('v0.99.99')],'1.0.6'),null);
 assert.equal(selectAppUpdate([],'1.0.6'),null);
});

test('drafts and arbitrary alpha, beta, release candidate or malformed tags are ignored',()=>{
 assert.equal(selectAppUpdate([release('v9.0.0-android-test',{draft:true})],'1.0.6'),null);
 for(const tag of ['v1.0.7-alpha','v1.0.7-beta.1','v1.0.7-rc.1','v1.0.7+build','1.0.7','v1.0','v01.0.7','v1.00.7','v1.0.07','v-1.0.7','v1.0.7.1',' v1.0.7','v1.0.7-android-test '])assert.equal(selectAppUpdate([release(tag)],'1.0.6'),null,tag);
});

test('only a complete exact-name APK asset can make a release installable',()=>{
 const tag='v1.0.7-android-test';
 assert.equal(selectAppUpdate([release(tag,{assets:[]})],'1.0.6'),null);
 for(const patch of [{name:'previous-FERIT-raspored.apk'},{name:'FERIT-raspored-source.zip'},{name:'ferit-raspored.apk'},{state:'new'},{state:'starter'},{size:0},{size:-1},{size:1.5},{size:Infinity},{size:NaN}])assert.equal(selectAppUpdate([release(tag,{assets:[asset(tag,patch)]})],'1.0.6'),null,JSON.stringify(patch));
});

test('an unfinished newer release does not hide the newest usable update',()=>{
 const newer='v1.0.10-android-test';
 const usable='v1.0.9-android-test';
 assert.equal(selectAppUpdate([release(newer,{assets:[asset(newer,{state:'new'})]}),release(usable)],'1.0.6')?.tag,usable);
});

test('APK URLs must retain the exact trusted host, repo, tag and filename',()=>{
 const tag='v1.0.7-android-test';
 const urls=[
  apk(tag).replace('https:','http:'),apk(tag).replace('github.com','github.com.evil.example'),apk(tag).replace('github.com','github.com@evil.example'),apk(tag).replace('github.com','user:pass@github.com'),apk(tag).replace('github.com','github.com:443'),
  apk(tag).replace('KTihana/FERIT-raspored','someone/FERIT-raspored'),apk(tag).replace('FERIT-raspored/releases','other-repo/releases'),apk('v1.0.8-android-test'),
  apk(tag)+'?download=1',apk(tag)+'?',apk(tag)+'#download',apk(tag)+'#',apk(tag)+' ',
  apk(tag).replace('/releases/download/','/x/../releases/download/'),apk(tag).replace('/releases/download/','/%2e%2e/releases/download/'),apk(tag).replace(tag,encodeURIComponent(tag).replace('v','%76')),apk(tag).replace('FERIT-raspored.apk','other.apk'),
 ];
 for(const url of urls)assert.equal(selectAppUpdate([release(tag,{assets:[asset(tag,{browser_download_url:url})]})],'1.0.6'),null,url);
});

test('release page URLs cannot point at a different release or an unrelated site',()=>{
 const tag='v1.0.7-android-test';
 for(const url of [page('v1.0.8-android-test'),page(tag).replace('github.com','evil.example'),page(tag)+'?ref=other',page(tag)+'#notes',page(tag).replace('/releases/','/unused/../releases/'),`${REPO}/releases/latest`])assert.equal(selectAppUpdate([release(tag,{html_url:url})],'1.0.6'),null,url);
});

test('runtime APK validation accepts only canonical stable or Android test links',()=>{
 assert.equal(isTrustedApkUrl(apk('v1.0.7-android-test')),true);assert.equal(isTrustedApkUrl(apk('v2.0.0')),true);
 for(const value of [null,{},4,apk('v1.0.7-beta'),apk('v01.0.7'),apk('v1.0.7')+'?x=1',apk('v1.0.7').replace('/releases/','/x/../releases/'),'javascript:alert(1)'])assert.equal(isTrustedApkUrl(value),false);
});

test('unexpected API structures report a failed check, never a false up-to-date state',()=>{
 const tag='v1.0.7-android-test';
 const payloads:unknown[]=[null,{},'[]',{message:'API rate limit exceeded'},[null],[{}],[release(tag,{draft:'false'})],[release(tag,{prerelease:null})],[release(tag,{tag_name:7})],[release(tag,{html_url:null})],[release(tag,{assets:null})],[release(tag,{assets:[null]})],[release(tag,{assets:[asset(tag,{size:'4900000'})]})],[release(tag,{assets:[asset(tag,{state:undefined})]})],[release(tag,{body:42})]];
 for(const payload of payloads)assert.throws(()=>selectAppUpdate(payload,'1.0.6'),/GitHub.*format izdanja/);
});

test('malformed installed versions are reported instead of accidentally proposing a downgrade',()=>{
 for(const version of ['','v1.0.6','1.0','01.0.6','1.0.6-beta','1.0.6 '])assert.throws(()=>selectAppUpdate([],version),/Verziju aplikacije/);
});

test('a stable build wins an equal-version tie without mutating the API response',()=>{
 const stable=release('v1.0.7');const testRelease=release('v1.0.7-android-test');
 const releases=Object.freeze([Object.freeze(testRelease),Object.freeze(stable)]);
 assert.equal(selectAppUpdate(releases,'1.0.6')?.tag,'v1.0.7');
 assert.equal(selectAppUpdate([...releases].reverse(),'1.0.6')?.tag,'v1.0.7');
 assert.equal(releases[0].tag_name,'v1.0.7-android-test');
});

test('large numeric version components cannot overflow into equal comparisons',()=>{
 assert.equal(selectAppUpdate([release('v1.0.9007199254740992'),release('v1.0.9007199254740993')],'1.0.6')?.version,'1.0.9007199254740993');
});
