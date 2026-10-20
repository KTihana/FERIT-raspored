import sharp from 'sharp';
import {readFile,writeFile,mkdir,unlink,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const native=await access(join(root,'mobile/assets/ferit-symbol.svg')).then(()=>true,()=>false);
const source=join(root,native?'mobile/assets/ferit-symbol.svg':'public/icon.svg');
const svg=await readFile(source,'utf8');
const padded=svg.replace('viewBox="0 0 512 512"','viewBox="-128 -128 768 768"');
const res=join(root,'android/app/src/main/res');
const paths=[...svg.matchAll(/<path\s+([^>]+)\/>/g)].map(m=>m[1]);
const attr=(path,name)=>path.match(new RegExp(`(?:^|\\s)${name}="([^"]+)"`))?.[1];
const xmlPath=path=>`<path android:pathData="${attr(path,'d').replace(/\s+/g,' ').trim()}"${attr(path,'fill')?` android:fillColor="${attr(path,'fill')}"`:''}${attr(path,'stroke')?` android:strokeColor="${attr(path,'stroke')}" android:strokeWidth="${attr(path,'stroke-width')}" android:strokeLineJoin="miter"`:''}${attr(path,'fill-rule')==='evenodd'?' android:fillType="evenOdd"':''}/>`;
if(paths.length!==5)throw new Error('Unexpected FERIT SVG structure; inspect before generating icons.');
const vector=`<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="768" android:viewportHeight="768">\n<group android:translateX="128" android:translateY="128"><group><clip-path android:pathData="${attr(paths[0],'d')}"/>${paths.slice(1,4).map(xmlPath).join('')}</group>${xmlPath(paths[4])}</group>\n</vector>\n`;
await mkdir(join(res,'drawable'),{recursive:true});
await writeFile(join(res,'drawable/ferit_symbol.xml'),vector);
for(const [density,size] of Object.entries({mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192})){
 const dir=join(res,`mipmap-${density}`);await mkdir(dir,{recursive:true});
 for(const name of ['ic_launcher','ic_launcher_round'])await sharp(Buffer.from(padded)).resize(size,size).flatten({background:'#ffffff'}).png().toFile(join(dir,`${name}.png`));
 await unlink(join(dir,'ic_launcher_foreground.png')).catch(e=>{if(e.code!=='ENOENT')throw e;});
}
await writeFile(join(res,'values/ic_launcher_background.xml'),'<resources><color name="ic_launcher_background">#ffffff</color></resources>\n');
for(const name of ['ic_launcher','ic_launcher_round'])await writeFile(join(res,`mipmap-anydpi-v26/${name}.xml`),'<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_background"/><foreground android:drawable="@drawable/ferit_symbol"/></adaptive-icon>\n');
await sharp(Buffer.from(padded)).resize(1024,1024).flatten({background:'#ffffff'}).png().toFile(join(root,'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
if(!native)for(const size of [192,512])await sharp(Buffer.from(padded)).resize(size,size).flatten({background:'#ffffff'}).png().toFile(join(root,`public/icon-${size}.png`));
console.log('Icons regenerated from FERIT SVG; Android adaptive foreground uses vector paths.');
