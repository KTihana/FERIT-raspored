// Native resources for the selected translucent widget. Run after changing the source SVG.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const res=join(root,'android/app/src/main/res');
const svg=await readFile(join(root,'mobile/assets/ferit-symbol.svg'),'utf8');
const paths=[...svg.matchAll(/<path\s+([^>]+)\/>/g)].map(m=>m[1]);
const attr=(p,n)=>p.match(new RegExp(`(?:^|\\s)${n}="([^"]+)"`))?.[1];
if(paths.length!==5)throw new Error('Inspect changed FERIT SVG before regenerating.');
const xml=p=>`<path android:pathData="${attr(p,'d').replace(/\s+/g,' ').trim()}"${attr(p,'fill')?` android:fillColor="${attr(p,'fill')==='#1A517B'?'#D6E8FF':attr(p,'fill')}"`:''}${attr(p,'stroke')?' android:strokeColor="#D6E8FF" android:strokeWidth="8" android:strokeLineJoin="miter"':''}${attr(p,'fill-rule')==='evenodd'?' android:fillType="evenOdd"':''}/>`;
await mkdir(join(res,'drawable'),{recursive:true});
await writeFile(join(res,'drawable/widget_ferit_logo.xml'),`<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="28dp" android:height="28dp" android:viewportWidth="512" android:viewportHeight="512">
<group><clip-path android:pathData="${attr(paths[0],'d')}"/>${paths.slice(1,4).map(xml).join('')}</group>${xml(paths[4])}</vector>\n`);

// Keep repeatable native row geometry identical; no WebView or bitmap UI in the widget.
const divider='<ImageView android:layout_width="match_parent" android:layout_height="1dp" android:background="#305E7895" android:importantForAccessibility="no"/>';
const text=(id,content,size=15,extra='')=>`<TextView ${id?`android:id="@+id/${id}"`:''} android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="${content}" android:textColor="#BDD3F2" android:textSize="${size}sp" android:includeFontPadding="false" ${extra}/>`;
const next=n=>`<LinearLayout android:id="@+id/widget_next${n}" android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="vertical">
${divider}
<LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:paddingTop="8dp" android:paddingBottom="8dp" android:gravity="top">
<ImageView android:id="@+id/widget_dot${n}" android:layout_width="12dp" android:layout_height="12dp" android:layout_marginTop="3dp" android:layout_marginEnd="10dp" android:src="@drawable/widget_dot" android:importantForAccessibility="no"/>
${text(`widget_next_time${n}`,n===1?'12:15':'13:15',15).replace('layout_width="wrap_content"','layout_width="47dp"')}
<LinearLayout android:layout_width="0dp" android:layout_weight="1" android:layout_height="wrap_content" android:orientation="vertical">
${text(`widget_next_title${n}`,n===1?'Konzultacije':'Web programiranje',15,'android:textStyle="bold" android:maxLines="1" android:ellipsize="end"').replace('#BDD3F2','#FFFFFF').replace('layout_width="wrap_content"','layout_width="match_parent"')}
${text(`widget_next_detail${n}`,n===1?'Za 1 h · 15 min pauze':'13:15 – 15:00',12,`android:layout_marginTop="3dp" android:maxLines="2" android:ellipsize="end"${n===2?' android:visibility="gone"':''}`).replace('layout_width="wrap_content"','layout_width="match_parent"')}
</LinearLayout>
${text(`widget_next_room${n}`,n===1?'T2-14':'T2-31',14,'android:maxWidth="65dp" android:layout_marginStart="7dp" android:maxLines="1" android:ellipsize="end"')}
</LinearLayout></LinearLayout>`;
const layout=`<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
 android:id="@+id/widget_root" android:layout_width="match_parent" android:layout_height="match_parent"
 android:orientation="vertical" android:background="@drawable/widget_glass" android:padding="16dp">
 <LinearLayout android:layout_width="match_parent" android:layout_height="28dp" android:gravity="center_vertical">
  <ImageView android:layout_width="27dp" android:layout_height="29dp" android:src="@drawable/widget_ferit_logo" android:contentDescription="FERIT"/>
  ${text('','FERIT',16,'android:layout_marginStart="8dp" android:textStyle="bold"').replace('#BDD3F2','#FFFFFF')}
  ${text('','\\u0020raspored',16,'android:layout_weight="1"').replace('layout_width="wrap_content"','layout_width="0dp"')}
  <ImageView android:id="@+id/widget_refresh" android:layout_width="40dp" android:layout_height="40dp" android:padding="8dp" android:src="@drawable/widget_refresh" android:contentDescription="@string/widget_refresh"/>
 </LinearLayout>
 <LinearLayout android:layout_width="match_parent" android:layout_height="32dp" android:gravity="center_vertical" android:layout_marginTop="4dp" android:layout_marginBottom="4dp">
  <ImageView android:id="@+id/widget_previous" android:layout_width="28dp" android:layout_height="match_parent" android:padding="5dp" android:layout_marginEnd="6dp" android:src="@drawable/widget_previous" android:contentDescription="@string/widget_previous"/>
  ${text('widget_day','Danas',24,'android:textStyle="bold"').replace('#BDD3F2','#FFFFFF')}
  ${text('widget_date','20. listopada',17,'android:layout_marginStart="8dp" android:maxLines="1" android:ellipsize="end" android:layout_weight="1"').replace('layout_width="wrap_content"','layout_width="0dp"')}
  <ImageView android:id="@+id/widget_next_day" android:layout_width="28dp" android:layout_height="match_parent" android:padding="5dp" android:src="@drawable/widget_next_day" android:contentDescription="@string/widget_next_day"/>
 </LinearLayout>
 ${divider}
 <LinearLayout android:id="@+id/widget_hero" android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="8dp" android:layout_marginBottom="8dp">
  <ImageView android:layout_width="6dp" android:layout_height="match_parent" android:src="@drawable/widget_marker" android:scaleType="fitXY" android:importantForAccessibility="no"/>
  <LinearLayout android:layout_width="0dp" android:layout_weight="1" android:layout_height="wrap_content" android:layout_marginStart="12dp" android:orientation="vertical">
   ${text('widget_status','U tijeku',13,'android:background="@drawable/widget_pill" android:textStyle="bold"').replace('#BDD3F2','#19222A')}
   ${text('widget_title','Programsko inženjerstvo',20,'android:layout_marginTop="6dp" android:textStyle="bold" android:maxLines="2" android:ellipsize="end"').replace('#BDD3F2','#FFFFFF').replace('layout_width="wrap_content"','layout_width="match_parent"')}
   <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="4dp" android:gravity="center_vertical">
    ${text('widget_time','10:00 – 12:00',15,'android:layout_weight="1"').replace('layout_width="wrap_content"','layout_width="0dp"')}
    ${text('widget_room','K3-12',15,'android:maxWidth="100dp" android:maxLines="1" android:ellipsize="end"')}
   </LinearLayout>
   ${text('widget_group','LV · SR-LV3',14,'android:layout_marginTop="3dp" android:maxLines="1" android:ellipsize="end"').replace('layout_width="wrap_content"','layout_width="match_parent"')}
   <LinearLayout android:id="@+id/widget_tomorrow_start_row" android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="5dp" android:gravity="center_vertical" android:visibility="gone">
    <ImageView android:layout_width="16dp" android:layout_height="16dp" android:layout_marginEnd="6dp" android:src="@drawable/widget_clock" android:importantForAccessibility="no"/>
    ${text('widget_tomorrow_start','Počinje sutra u 09:00',12,'android:layout_weight="1" android:maxLines="1" android:ellipsize="end"').replace('layout_width="wrap_content"','layout_width="0dp"')}
   </LinearLayout>
   <LinearLayout android:id="@+id/widget_progress_row" android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="4dp" android:gravity="center_vertical">
    <ProgressBar android:id="@+id/widget_progress" style="?android:attr/progressBarStyleHorizontal" android:layout_width="0dp" android:layout_weight="1" android:layout_height="6dp" android:max="10000" android:progress="6250" android:indeterminate="false" android:progressDrawable="@drawable/widget_progress" android:progressTint="#FFB987" android:progressBackgroundTint="#4D9BB1CA"/>
    ${text('widget_remaining','Još 45 min',13,'android:layout_marginStart="10dp"')}
   </LinearLayout>
  </LinearLayout>
 </LinearLayout>
 <LinearLayout android:id="@+id/widget_empty" android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" android:orientation="vertical" android:gravity="center_vertical" android:visibility="gone" android:paddingTop="20dp" android:paddingBottom="20dp">
  ${text('widget_empty_title','',22,'android:textStyle="bold"').replace('#BDD3F2','#FFFFFF')}
  ${text('widget_empty_body','',15,'android:layout_marginTop="8dp"')}
 </LinearLayout>
 ${next(1)}${next(2)}
 <LinearLayout android:id="@+id/widget_space" android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" android:orientation="vertical"/>
 ${divider}
 <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:gravity="center_vertical" android:paddingTop="4dp">
  ${text('widget_footer','Još 2 termina nakon ovog',12,'android:layout_weight="1" android:maxLines="2" android:ellipsize="end"').replace('layout_width="wrap_content"','layout_width="0dp"')}
  <ImageView android:id="@+id/widget_open" android:layout_width="30dp" android:layout_height="24dp" android:paddingStart="7dp" android:src="@drawable/widget_calendar" android:contentDescription="@string/widget_open"/>
 </LinearLayout>
</LinearLayout>`;
await mkdir(join(res,'layout'),{recursive:true});
await writeFile(join(res,'layout/schedule_widget.xml'),layout+'\n');
await mkdir(join(res,'layout-v26'),{recursive:true});
await writeFile(join(res,'layout-v26/schedule_widget.xml'),layout.replaceAll('android:includeFontPadding="false"','android:includeFontPadding="false" android:fontFamily="@font/widget_inter"')+'\n');
console.log('Widget layout and exact FERIT vector resources generated.');
