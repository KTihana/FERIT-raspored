package app.mojraspored.ferit.widget;

import android.appwidget.*;
import android.content.*;
import android.os.Bundle;

public class ScheduleWidgetProvider extends AppWidgetProvider {
    public static final String TICK="app.mojraspored.ferit.WIDGET_TICK";
    public static final String REFRESH="app.mojraspored.ferit.WIDGET_REFRESH";
    public static int[] ids(Context c){return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c,ScheduleWidgetProvider.class));}
    public static boolean hasWidgets(Context c){return ids(c).length>0;}
    @Override public void onUpdate(Context c,AppWidgetManager manager,int[] ids){
        WidgetRuntime.start(c);WidgetRuntime.render(c);WidgetRuntime.scheduleTick(c);
        if(!WidgetStore.read(c,System.currentTimeMillis()).available)WidgetRefreshJob.request(c);
    }
    @Override public void onEnabled(Context c){WidgetRuntime.start(c);WidgetRefreshJob.ensureHourly(c);}
    @Override public void onDisabled(Context c){WidgetRuntime.stop(c);}
    @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager m,int id,Bundle options){WidgetRuntime.render(c);}
    @Override public void onReceive(Context c,Intent intent){
        super.onReceive(c,intent);
        String action=intent.getAction();
        if(REFRESH.equals(action)){WidgetRefreshJob.request(c);return;}
        if(TICK.equals(action)||Intent.ACTION_BOOT_COMPLETED.equals(action)||Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)||
           Intent.ACTION_TIME_CHANGED.equals(action)||Intent.ACTION_TIMEZONE_CHANGED.equals(action)||
           "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED".equals(action)){
            if(!hasWidgets(c)){WidgetRuntime.stop(c);return;}
            WidgetRuntime.start(c);
            if(TICK.equals(action))WidgetRuntime.clockTick(c);else WidgetRuntime.render(c);
            WidgetRuntime.scheduleTick(c);
            if(!TICK.equals(action) && !WidgetStore.read(c,System.currentTimeMillis()).available)WidgetRefreshJob.request(c);
        }
    }
}
