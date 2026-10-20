package app.mojraspored.ferit.widget;

import android.appwidget.*;
import android.content.*;
import android.os.Bundle;

public class ScheduleWidgetProvider extends AppWidgetProvider {
    public static final String TICK="app.mojraspored.ferit.WIDGET_TICK";
    public static final String REFRESH="app.mojraspored.ferit.WIDGET_REFRESH";
    public static final String NAVIGATE="app.mojraspored.ferit.WIDGET_NAVIGATE";
    public static int[] ids(Context c){return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c,ScheduleWidgetProvider.class));}
    public static boolean hasWidgets(Context c){return ids(c).length>0;}
    @Override public void onUpdate(Context c,AppWidgetManager manager,int[] ids){
        WidgetRuntime.start(c);WidgetRuntime.render(c);WidgetRuntime.scheduleTick(c);
        WidgetRefreshJob.requestMissing(c);
    }
    @Override public void onEnabled(Context c){WidgetRuntime.start(c);WidgetRefreshJob.ensureHourly(c);}
    @Override public void onDisabled(Context c){WidgetRuntime.stop(c);}
    @Override public void onDeleted(Context c,int[] ids){
        android.content.SharedPreferences.Editor edit=WidgetStore.status(c).edit();
        for(int id:ids)edit.remove("day:"+id);
        edit.apply();WidgetRuntime.scheduleTick(c);
    }
    @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager m,int id,Bundle options){WidgetRuntime.render(c);}
    @Override public void onReceive(Context c,Intent intent){
        super.onReceive(c,intent);
        String action=intent.getAction();
        if(NAVIGATE.equals(action)){
            int id=intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,-1);
            boolean exists=false;for(int current:ids(c))if(current==id)exists=true;
            if(!exists)return;
            long now=System.currentTimeMillis();
            String date=intent.getBooleanExtra("reset",false)?WidgetData.today(now)
                : intent.hasExtra("direction")?WidgetData.shiftDate(WidgetStore.date(c,id,now),intent.getIntExtra("direction",0),now)
                : intent.getBooleanExtra("tomorrow",false)?WidgetData.tomorrow(now):WidgetData.today(now);
            WidgetStore.selectDate(c,id,date,now);
            WidgetRuntime.start(c);WidgetRuntime.render(c);WidgetRuntime.scheduleTick(c);
            WidgetRefreshJob.requestMissing(c);return;
        }
        if(REFRESH.equals(action)){WidgetRefreshJob.request(c);return;}
        if(TICK.equals(action)||Intent.ACTION_BOOT_COMPLETED.equals(action)||Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)||
           Intent.ACTION_TIME_CHANGED.equals(action)||Intent.ACTION_TIMEZONE_CHANGED.equals(action)||
           "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED".equals(action)){
            if(!hasWidgets(c)){WidgetRuntime.stop(c);return;}
            WidgetRuntime.start(c);
            if(TICK.equals(action))WidgetRuntime.clockTick(c);else WidgetRuntime.render(c);
            WidgetRuntime.scheduleTick(c);
            if(!TICK.equals(action))WidgetRefreshJob.requestMissing(c);
        }
    }
}
