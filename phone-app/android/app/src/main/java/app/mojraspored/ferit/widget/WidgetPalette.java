package app.mojraspored.ferit.widget;

import android.content.Context;
import org.json.JSONObject;

/** Resources are generated from the timetable CSS, including the selected theme. */
public final class WidgetPalette {
    public final int accent, fill, rail, pillText, pill, progressLayout;
    public WidgetPalette(Context context,JSONObject lesson,boolean dark) {
        String type=WidgetData.palette(lesson);
        String name=type+(dark?"_dark":"_light");
        fill=context.getColor(resource(context,"color","widget_"+name+"_fill"));
        rail=context.getColor(resource(context,"color","widget_"+name+"_rail"));
        accent=context.getColor(resource(context,"color","widget_"+type+"_bright"));
        pillText=context.getColor(resource(context,"color","widget_"+type+"_light_rail"));
        pill=resource(context,"drawable","widget_pill_"+name);
        progressLayout=resource(context,"layout","widget_progress_"+name);
    }
    private static int resource(Context context,String type,String name) {
        int id=context.getResources().getIdentifier(name,type,context.getPackageName());
        if(id==0)throw new IllegalStateException("Missing schedule palette: "+name);
        return id;
    }
}
