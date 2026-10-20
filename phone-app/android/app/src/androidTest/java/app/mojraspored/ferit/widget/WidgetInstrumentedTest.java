package app.mojraspored.ferit.widget;

import android.app.*;
import android.app.job.*;
import android.appwidget.*;
import android.content.*;
import android.graphics.*;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import app.mojraspored.ferit.R;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class WidgetInstrumentedTest {
    private final Instrumentation ins=InstrumentationRegistry.getInstrumentation();
    private final Context context=ins.getTargetContext();
    private List<JSONObject> sample(String date)throws Exception{
        List<JSONObject> result=new ArrayList<>();
        String[][] rows={{"10:00","12:00","Programsko inženjerstvo","K3-12","LV","SR-LV3"},{"12:15","13:00","Konzultacije","T2-14","OSOBNO",""},{"13:15","15:00","Web programiranje","T2-31","PR","SR-PR"}};
        for(int i=0;i<rows.length;i++){
            String[] r=rows[i];JSONObject l=new JSONObject().put("id","demo-"+i).put("scheduleKey","3-53").put("date",date)
                .put("start",r[0]).put("end",r[1]).put("title",r[2]).put("room",r[3]).put("type",r[4]).put("group",r[5])
                .put("teacher","").put("progress","").put("courseCode","").put("typeLabel",r[4]);
            if(i==1)l.put("personal",true);
            result.add(l);
        }
        return result;
    }
    private Bundle options(int width,int height){
        Bundle b=new Bundle();b.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,width);b.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,height);return b;
    }
    @Test public void renderAllStatesAndSizesUsingRealRemoteViews()throws Exception{
        List<JSONObject> lessons=sample("2026-10-20");
        for(String clock:new String[]{"09:41","11:15","11:55","12:00","15:00"}){
            long now=WidgetData.time("2026-10-20",clock);
            WidgetStore.Snapshot s=new WidgetStore.Snapshot();s.available=true;s.configured=true;s.state=WidgetData.state(lessons,now);
            render(s,now,350,350,"widget-"+clock.replace(":",""));
        }
        WidgetStore.Snapshot s=new WidgetStore.Snapshot();s.available=true;s.configured=true;s.state=WidgetData.state(lessons,WidgetData.time("2026-10-20","11:15"));
        render(s,WidgetData.time("2026-10-20","11:15"),250,280,"widget-compact");
        lessons.get(0).put("title","Projektiranje složenih računalnih i komunikacijskih sustava");
        s.state=WidgetData.state(lessons,WidgetData.time("2026-10-20","11:15"));
        render(s,WidgetData.time("2026-10-20","11:15"),350,350,"widget-long-title");
        s.state=WidgetData.state(Collections.emptyList(),WidgetData.time("2026-10-20","11:15"));
        render(s,WidgetData.time("2026-10-20","11:15"),350,350,"widget-free-day");
    }
    private void render(WidgetStore.Snapshot snapshot,long now,int width,int height,String name)throws Exception{
        AtomicReference<Throwable> failure=new AtomicReference<>();
        ins.runOnMainSync(()->{
            try{
                float d=context.getResources().getDisplayMetrics().density;
                RemoteViews rv=WidgetRenderer.views(context,snapshot,now,options(width,height));
                View view=rv.apply(context,new FrameLayout(context));
                int w=Math.round(width*d),h=Math.round(height*d);
                view.measure(View.MeasureSpec.makeMeasureSpec(w,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED));
                android.util.Log.i("WidgetQA",name+" natural height="+view.getMeasuredHeight()/d+"dp, available="+height);
                view.measure(View.MeasureSpec.makeMeasureSpec(w,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(h,View.MeasureSpec.EXACTLY));
                view.layout(0,0,w,h);
                TextView footer=view.findViewById(R.id.widget_footer);
                int bottom=footer.getBottom();ViewParent parent=footer.getParent();
                while(parent instanceof View && parent!=view){bottom+=((View)parent).getTop();parent=parent.getParent();}
                assertTrue("Footer has no height at "+width+"x"+height,footer.getHeight()>0);
                assertTrue("Footer clipped at "+width+"x"+height+": "+bottom+" > "+h,bottom<=h);
                if(snapshot.state.active){
                    assertEquals(snapshot.state.progress,((ProgressBar)view.findViewById(R.id.widget_progress)).getProgress());
                    assertEquals("Još "+WidgetData.duration(snapshot.state.remaining),((TextView)view.findViewById(R.id.widget_remaining)).getText().toString());
                }
                // Draw the actual native view over a test wallpaper to inspect transparency.
                int margin=Math.round(20*d);Bitmap bitmap=Bitmap.createBitmap(w+margin*2,h+margin*2,Bitmap.Config.ARGB_8888);
                Canvas canvas=new Canvas(bitmap);Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);
                p.setShader(new LinearGradient(0,0,bitmap.getWidth(),bitmap.getHeight(),new int[]{0xff073754,0xff366F7E,0xffDBBB8D},null,Shader.TileMode.CLAMP));
                canvas.drawRect(0,0,bitmap.getWidth(),bitmap.getHeight(),p);
                canvas.translate(margin,margin);view.draw(canvas);
                File dir=new File(context.getExternalFilesDir(null),"widget-qa");dir.mkdirs();
                try(FileOutputStream stream=new FileOutputStream(new File(dir,name+".png"))){bitmap.compress(Bitmap.CompressFormat.PNG,100,stream);}
                bitmap.recycle();
            }catch(Throwable error){failure.set(error);}
        });
        if(failure.get()!=null)throw new AssertionError(failure.get());
    }
    private static class CountingView extends AppWidgetHostView{
        int updates;
        CountingView(Context c){super(c);}
        @Override public void updateAppWidget(RemoteViews views){super.updateAppWidget(views);updates++;}
    }
    private void shell(String command)throws IOException{
        try(ParcelFileDescriptor fd=ins.getUiAutomation().executeShellCommand(command);InputStream in=new ParcelFileDescriptor.AutoCloseInputStream(fd)){byte[] buffer=new byte[4096];while(in.read(buffer)!=-1){}}
    }
    @Test public void hostUpdatesFromPhoneClockAndSkipsScreenOff()throws Exception{
        SharedPreferences shared=WidgetStore.shared(context),status=WidgetStore.status(context);
        Map<String,?> oldShared=new HashMap<>(shared.getAll()),oldStatus=new HashMap<>(status.getAll());
        AtomicReference<AppWidgetHost> host=new AtomicReference<>();AtomicReference<CountingView> hostView=new AtomicReference<>();
        AtomicInteger widgetId=new AtomicInteger(-1);
        String date=WidgetData.today(System.currentTimeMillis());
        try{
            JSONObject prefs=new JSONObject().put("selection",new JSONObject().put("key","3-53"));
            // Whole-day fixture guarantees a current class regardless of emulator time.
            List<JSONObject> lessons=sample(date);
            JSONObject active=lessons.get(0).put("start","00:00").put("end","23:59");
            JSONObject schedule=new JSONObject().put("lessons",new JSONArray().put(active))
                .put("sourceUrl",WidgetData.SOURCE+"/"+WidgetData.monday(date)+"/3-53")
                .put("fetchedAt",Instant.now().toString()).put("teachingWeek","4. nastavni tj.");
            shared.edit().putString(WidgetData.PREFS_KEY,prefs.toString()).putString(WidgetData.cacheKey("3-53",date),schedule.toString()).commit();
            ins.getUiAutomation().adoptShellPermissionIdentity("android.permission.BIND_APPWIDGET");
            ins.runOnMainSync(()->{
                AppWidgetHost h=new AppWidgetHost(context,9876){
                    @Override protected AppWidgetHostView onCreateView(Context c,int id,AppWidgetProviderInfo info){CountingView view=new CountingView(c);hostView.set(view);return view;}
                };host.set(h);
                int id=h.allocateAppWidgetId();widgetId.set(id);
                assertTrue("Widget bind",AppWidgetManager.getInstance(context).bindAppWidgetIdIfAllowed(id,new ComponentName(context,ScheduleWidgetProvider.class),options(350,350)));
                h.startListening();
                h.createView(context,id,AppWidgetManager.getInstance(context).getAppWidgetInfo(id));
                WidgetRuntime.start(context);WidgetRuntime.render(context);WidgetRuntime.scheduleTick(context);
            });
            ins.getUiAutomation().dropShellPermissionIdentity();
            Thread.sleep(1500);
            JobInfo hourly=context.getSystemService(JobScheduler.class).getPendingJob(WidgetRefreshJob.HOURLY);
            assertNotNull(hourly);assertEquals(3600000L,hourly.getIntervalMillis());assertTrue(hourly.isPersisted());
            assertTrue(context.getSystemService(AlarmManager.class).canScheduleExactAlarms());
            shell("input keyevent 224");shell("wm dismiss-keyguard");Thread.sleep(500);
            ins.runOnMainSync(()->WidgetRuntime.render(context));ins.waitForIdleSync();
            int before=((ProgressBar)hostView.get().findViewById(R.id.widget_progress)).getProgress();
            String beforeLabel=((TextView)hostView.get().findViewById(R.id.widget_remaining)).getText().toString();
            // Wait across a minute boundary: the receiver must redraw without tapping refresh.
            long wait=61000-System.currentTimeMillis()%60000;
            Thread.sleep(wait);ins.waitForIdleSync();
            int after=((ProgressBar)hostView.get().findViewById(R.id.widget_progress)).getProgress();
            // A whole-day test class can round to the same 0.01% if sampled just before a minute.
            assertTrue("Progress moved backwards",after>=before);
            assertNotEquals("Minute display did not advance automatically",beforeLabel,((TextView)hostView.get().findViewById(R.id.widget_remaining)).getText().toString());
            shell("input keyevent 223");Thread.sleep(500);ins.waitForIdleSync();
            assertFalse(WidgetRuntime.screenOn(context));
            int updates=hostView.get().updates;
            ins.runOnMainSync(()->WidgetRuntime.render(context));
            Thread.sleep(65000);ins.waitForIdleSync();
            assertEquals("Screen-off tick repainted the widget",updates,hostView.get().updates);
            shell("input keyevent 224");shell("wm dismiss-keyguard");Thread.sleep(2000);ins.waitForIdleSync();
            assertTrue(WidgetRuntime.screenOn(context));
            assertTrue("Wake did not catch up",hostView.get().updates>updates);
            int awake=((ProgressBar)hostView.get().findViewById(R.id.widget_progress)).getProgress();
            assertTrue(awake>after);
            verifyRefresh(hostView.get(),date);
        }finally{
            ins.getUiAutomation().dropShellPermissionIdentity();
            shell("input keyevent 224");
            ins.runOnMainSync(()->{if(host.get()!=null){if(widgetId.get()!=-1)host.get().deleteAppWidgetId(widgetId.get());host.get().stopListening();}if(!ScheduleWidgetProvider.hasWidgets(context))WidgetRuntime.stop(context);});
            restore(shared,oldShared);restore(status,oldStatus);
        }
    }
    private void verifyRefresh(CountingView view,String date)throws Exception{
        int wifi=Settings.Global.getInt(context.getContentResolver(),"wifi_on",1);
        int data=Settings.Global.getInt(context.getContentResolver(),"mobile_data",1);
        String key=WidgetData.cacheKey("3-53",date);
        String cached=WidgetStore.shared(context).getString(key,null);
        try{
            shell("svc wifi disable");shell("svc data disable");Thread.sleep(1500);
            long attempt=WidgetStore.status(context).getLong("lastAttempt",0);
            ins.runOnMainSync(()->assertTrue(view.findViewById(R.id.widget_refresh).performClick()));
            awaitAttempt(attempt);
            assertEquals("Failed refresh erased cached classes",cached,WidgetStore.shared(context).getString(key,null));
            assertFalse("Failed refresh looks current",WidgetStore.status(context).getString("notice","").isEmpty());
        }finally{
            if(wifi!=0)shell("svc wifi enable");
            if(data!=0)shell("svc data enable");
        }
        Thread.sleep(3000);
        long attempt=WidgetStore.status(context).getLong("lastAttempt",0);
        ins.runOnMainSync(()->view.findViewById(R.id.widget_refresh).performClick());
        awaitAttempt(attempt);
        String notice=WidgetStore.status(context).getString("notice","");
        JSONObject stored=WidgetData.object(WidgetStore.shared(context).getString(key,null));
        assertTrue(WidgetData.validSchedule(stored,"3-53",date));
        if(notice.isEmpty())assertNotEquals("Successful refresh kept stale fixture",cached,stored.toString());
        JSONObject report=new JSONObject().put("hourlyPeriodMillis",3600000).put("screenOffNoRedraw",true)
            .put("wakeCaughtUp",true).put("minuteAdvanced",true).put("offlineCachePreserved",true)
            .put("liveRefreshSucceeded",notice.isEmpty()).put("liveRefreshNotice",notice)
            .put("liveLessonCount",stored.getJSONArray("lessons").length());
        File dir=new File(context.getExternalFilesDir(null),"widget-qa");dir.mkdirs();
        try(FileOutputStream out=new FileOutputStream(new File(dir,"runtime-report.json"))){out.write(report.toString(2).getBytes(java.nio.charset.StandardCharsets.UTF_8));}
    }
    private void awaitAttempt(long previous)throws Exception{
        long deadline=System.currentTimeMillis()+45000;
        while(System.currentTimeMillis()<deadline){
            if(WidgetStore.status(context).getLong("lastAttempt",0)>previous&&WidgetStore.status(context).getLong("refreshStarted",0)==0)return;
            Thread.sleep(200);
        }
        fail("Manual refresh job did not finish");
    }
    private void restore(SharedPreferences prefs,Map<String,?> map){
        SharedPreferences.Editor e=prefs.edit().clear();
        for(Map.Entry<String,?> item:map.entrySet()){
            Object v=item.getValue();
            if(v instanceof String)e.putString(item.getKey(),(String)v);
            else if(v instanceof Long)e.putLong(item.getKey(),(Long)v);
            else if(v instanceof Integer)e.putInt(item.getKey(),(Integer)v);
            else if(v instanceof Boolean)e.putBoolean(item.getKey(),(Boolean)v);
        }
        e.commit();
    }
}
