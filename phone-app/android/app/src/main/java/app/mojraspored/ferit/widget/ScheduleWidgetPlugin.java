package app.mojraspored.ferit.widget;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.os.Build;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name="ScheduleWidget")
public class ScheduleWidgetPlugin extends Plugin {
    @PluginMethod public void pin(PluginCall call) {
        AppWidgetManager manager=AppWidgetManager.getInstance(getContext());
        boolean supported=Build.VERSION.SDK_INT>=26 && manager.isRequestPinAppWidgetSupported();
        boolean requested=supported && manager.requestPinAppWidget(new ComponentName(getContext(),ScheduleWidgetProvider.class),WidgetPreview.pinExtras(getContext()),null);
        JSObject result=new JSObject();result.put("requested",requested);call.resolve(result);
    }
}
