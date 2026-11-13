package app.mojraspored.ferit.widget;

import android.content.Context;
import org.json.JSONObject;

/** Resources are generated from the timetable CSS, including the selected theme. */
public final class WidgetPalette {
    public final int accent, fill, rail, pill, progressLayout;
    public WidgetPalette(Context context,JSONObject lesson,boolean dark) {
        String name=WidgetData.palette(lesson)+(dark?"_dark":"_light");
        fill=context.getColor(resource(context,"color","widget_"+name+"_fill"));
        rail=context.getColor(resource(context,"color","widget_"+name+"_rail"));
        // The light schedule's card fill stays legible against the dark glass;
        // the dark schedule already supplies a light event rail.
        accent=dark?rail:fill;
        pill=resource(context,"drawable","widget_pill_"+name);
        progressLayout=resource(context,"layout","widget_progress_"+name);
    }
    private static int resource(Context context,String type,String name) {
        int id=context.getResources().getIdentifier(name,type,context.getPackageName());
        if(id==0)throw new IllegalStateException("Missing schedule palette: "+name);
        return id;
    }
}
