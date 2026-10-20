package app.mojraspored.ferit.widget;

import android.app.*;
import android.app.job.JobScheduler;
import android.appwidget.AppWidgetManager;
import android.content.*;
import android.os.*;

/** No service, wake lock, network call, or second-by-second polling for progress. */
public final class WidgetRuntime {
    private static final Handler MAIN=new Handler(Looper.getMainLooper());
    private static BroadcastReceiver screenReceiver;
    private static android.content.SharedPreferences.OnSharedPreferenceChangeListener preferencesListener;
    private static Runnable pendingRender;
    private static long lastMinute=-1;
    private static PendingIntent tick(Context c) {
        return PendingIntent.getBroadcast(c,4103,new Intent(c,ScheduleWidgetProvider.class).setAction(ScheduleWidgetProvider.TICK),
            PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    public static void start(Context context){
        Context c=context.getApplicationContext();
        if(!ScheduleWidgetProvider.hasWidgets(c))return;
        if(preferencesListener==null){
            preferencesListener=(prefs,key)->{
                if(key!=null && (key.equals(WidgetData.PREFS_KEY)||key.startsWith("ferit-week:")))postRender(c);
            };
            WidgetStore.shared(c).registerOnSharedPreferenceChangeListener(preferencesListener);
        }
        WidgetRefreshJob.ensureHourly(c);
        if(screenReceiver==null) {
            screenReceiver=new BroadcastReceiver(){
                @Override public void onReceive(Context context,Intent intent){
                    if(Intent.ACTION_SCREEN_OFF.equals(intent.getAction()))return;
                    boolean minute=Intent.ACTION_TIME_TICK.equals(intent.getAction());
                    long bucket=System.currentTimeMillis()/60000;
                    if(!minute || bucket!=lastMinute)render(c);
                    scheduleTick(c);
                }
            };
            IntentFilter f=new IntentFilter();
            f.addAction(Intent.ACTION_SCREEN_ON);f.addAction(Intent.ACTION_USER_PRESENT);f.addAction(Intent.ACTION_SCREEN_OFF);f.addAction(Intent.ACTION_TIME_TICK);
            if(Build.VERSION.SDK_INT>=33)c.registerReceiver(screenReceiver,f,Context.RECEIVER_NOT_EXPORTED);
            else c.registerReceiver(screenReceiver,f);
        }
    }
    public static boolean screenOn(Context c){return c.getSystemService(PowerManager.class).isInteractive();}
    public static void clockTick(Context c){
        // TIME_TICK and our process-restart fallback can arrive at the same boundary.
        if(System.currentTimeMillis()/60000!=lastMinute)render(c);
    }
    public static void postRender(Context context) {
        Context c=context.getApplicationContext();
        MAIN.post(()->{
            if(pendingRender!=null)MAIN.removeCallbacks(pendingRender);
            pendingRender=()->{start(c);render(c);scheduleTick(c);};
            MAIN.postDelayed(pendingRender,150);
        });
    }
    public static void render(Context c){
        if(!ScheduleWidgetProvider.hasWidgets(c)||!screenOn(c))return;
        long now=System.currentTimeMillis(); lastMinute=now/60000;
        WidgetStore.Snapshot snapshot=WidgetStore.read(c,now);
        AppWidgetManager manager=AppWidgetManager.getInstance(c);
        for(int id:ScheduleWidgetProvider.ids(c))
            manager.updateAppWidget(id,WidgetRenderer.views(c,snapshot,now,manager.getAppWidgetOptions(id)));
    }
    public static void scheduleTick(Context c) {
        if(!ScheduleWidgetProvider.hasWidgets(c))return;
        long now=System.currentTimeMillis();
        WidgetData.State state=WidgetStore.read(c,now).state;
        long at=state.hero!=null ? (now/60000+1)*60000+100 : state.nextChange+100;
        AlarmManager alarm=c.getSystemService(AlarmManager.class);
        long elapsed=SystemClock.elapsedRealtime()+Math.max(1000,at-now);
        try{
            // ELAPSED_REALTIME deliberately excludes WAKEUP and allowWhileIdle.
            // A sleeping phone stays asleep. On wake, one overdue tick catches up.
            if(Build.VERSION.SDK_INT<31 || alarm.canScheduleExactAlarms())alarm.setExact(AlarmManager.ELAPSED_REALTIME,elapsed,tick(c));
            else alarm.set(AlarmManager.ELAPSED_REALTIME,elapsed,tick(c));
        }catch(SecurityException denied){alarm.set(AlarmManager.ELAPSED_REALTIME,elapsed,tick(c));}
    }
    public static void stop(Context context) {
        Context c=context.getApplicationContext();
        c.getSystemService(AlarmManager.class).cancel(tick(c));
        JobScheduler jobs=c.getSystemService(JobScheduler.class);
        jobs.cancel(WidgetRefreshJob.HOURLY);jobs.cancel(WidgetRefreshJob.MANUAL);
        if(screenReceiver!=null){c.unregisterReceiver(screenReceiver);screenReceiver=null;}
        if(preferencesListener!=null){WidgetStore.shared(c).unregisterOnSharedPreferenceChangeListener(preferencesListener);preferencesListener=null;}
        if(pendingRender!=null)MAIN.removeCallbacks(pendingRender);
    }
    private WidgetRuntime(){}
}
