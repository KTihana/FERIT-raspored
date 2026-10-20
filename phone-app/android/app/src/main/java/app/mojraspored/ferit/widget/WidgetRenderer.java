package app.mojraspored.ferit.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.*;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import app.mojraspored.ferit.MainActivity;
import app.mojraspored.ferit.R;
import org.json.JSONObject;

public final class WidgetRenderer {
    public static RemoteViews views(Context c,WidgetStore.Snapshot snapshot,long now,Bundle options) {
        WidgetData.State state=snapshot.state;
        RemoteViews v=new RemoteViews(c.getPackageName(),R.layout.schedule_widget);
        PendingIntent open=PendingIntent.getActivity(c,4110,new Intent(c,MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra("widget_today",true),
            PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.widget_root,open);
        v.setOnClickPendingIntent(R.id.widget_open,open);
        v.setOnClickPendingIntent(R.id.widget_refresh,PendingIntent.getBroadcast(c,4111,
            new Intent(c,ScheduleWidgetProvider.class).setAction(ScheduleWidgetProvider.REFRESH),
            PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
        v.setTextViewText(R.id.widget_date,state.dateLabel);
        int height=options==null?350:options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,350);
        int width=options==null?350:options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,350);
        float fontScale=c.getResources().getConfiguration().fontScale;
        boolean compact=height/fontScale<345, narrow=width<310;
        v.setTextViewTextSize(R.id.widget_title,TypedValue.COMPLEX_UNIT_SP,narrow?18:20);
        v.setInt(R.id.widget_title,"setMaxLines",compact?1:2);
        v.setViewVisibility(R.id.widget_group,height/fontScale<290?View.GONE:View.VISIBLE);
        if(compact){int padding=Math.round(12*c.getResources().getDisplayMetrics().density);v.setViewPadding(R.id.widget_root,padding,padding,padding,padding);}
        v.setTextViewTextSize(R.id.widget_date,TypedValue.COMPLEX_UNIT_SP,narrow?15:18);
        v.setViewVisibility(R.id.widget_hero,state.hero==null?View.GONE:View.VISIBLE);
        v.setViewVisibility(R.id.widget_empty,state.hero==null?View.VISIBLE:View.GONE);
        v.setViewVisibility(R.id.widget_space,state.hero==null?View.GONE:View.VISIBLE);
        v.setViewVisibility(R.id.widget_next1,View.GONE);
        v.setViewVisibility(R.id.widget_next2,View.GONE);
        if(state.hero!=null){
            JSONObject h=state.hero;
            v.setTextViewText(R.id.widget_status,state.status);
            v.setTextViewText(R.id.widget_title,h.optString("title"));
            v.setTextViewText(R.id.widget_time,h.optString("start")+" – "+h.optString("end"));
            v.setTextViewText(R.id.widget_room,h.optString("room"));
            String type=h.optBoolean("personal")?"Osobni događaj":h.optString("type");
            if(type.equals("OSTALO"))type=h.optString("typeLabel");
            String group=h.optString("group");
            v.setTextViewText(R.id.widget_group,type+(group.isEmpty()?"":" · "+group));
            v.setViewVisibility(R.id.widget_progress_row,state.active?View.VISIBLE:View.GONE);
            v.setProgressBar(R.id.widget_progress,10000,state.progress,false);
            v.setContentDescription(R.id.widget_progress,"Prošlo je "+state.progress/100+" posto termina");
            v.setTextViewText(R.id.widget_remaining,"Još "+WidgetData.duration(state.remaining));
            if(!state.next.isEmpty()){
                JSONObject next=state.next.get(0);
                row(v,next,1);
                long start=WidgetData.time(state.date,next.optString("start"));
                long gap=(start-state.end)/60000;
                String detail=start<=now ? "Istodobni termin" : "Za "+WidgetData.duration((start-now+59999)/60000);
                if(start>now)detail+=gap>0?" · "+WidgetData.duration(gap)+" pauze":gap==0?" · bez pauze":" · preklapanje";
                v.setTextViewText(R.id.widget_next_detail1,detail);
                v.setViewVisibility(R.id.widget_next_detail1,compact?View.GONE:View.VISIBLE);
            }
            Paint measure=new Paint();
            Typeface font=Build.VERSION.SDK_INT>=26?c.getResources().getFont(R.font.widget_inter):Typeface.DEFAULT;
            measure.setTypeface(Typeface.create(font,Typeface.BOLD));
            measure.setTextSize((narrow?18:20)*c.getResources().getDisplayMetrics().scaledDensity);
            boolean titleWraps=measure.measureText(h.optString("title"))>(width-50)*c.getResources().getDisplayMetrics().density;
            if(state.next.size()>1&&!compact&&(!titleWraps||height/fontScale>=380))row(v,state.next.get(1),2);
        }else{
            v.setTextViewText(R.id.widget_empty_title,state.emptyTitle);
            v.setTextViewText(R.id.widget_empty_body,state.emptyBody);
        }
        String footer=state.footer;
        if(snapshot.refreshing)footer="Osvježavam raspored…";
        else if(!snapshot.notice.isEmpty())footer=snapshot.notice;
        else if(snapshot.partial || (!snapshot.available&&state.hero!=null))footer="Dio rasporeda još nije spremljen";
        v.setTextViewText(R.id.widget_footer,footer);
        v.setContentDescription(R.id.widget_refresh,snapshot.refreshing?"Osvježavanje je u tijeku":"Osvježi FERIT raspored");
        return v;
    }
    private static void row(RemoteViews v,JSONObject l,int number){
        boolean first=number==1;
        v.setViewVisibility(first?R.id.widget_next1:R.id.widget_next2,View.VISIBLE);
        v.setTextViewText(first?R.id.widget_next_time1:R.id.widget_next_time2,l.optString("start"));
        v.setTextViewText(first?R.id.widget_next_title1:R.id.widget_next_title2,l.optString("title"));
        v.setTextViewText(first?R.id.widget_next_room1:R.id.widget_next_room2,l.optString("room"));
        String color=l.optBoolean("personal")?"#C6B5FF":l.optString("type").equals("PR")?"#A6EEB0":l.optString("type").equals("LV")?"#FFB987":"#9FC8FF";
        if(l.optBoolean("personal")) {
            switch(l.optString("color")){
                case "green":color="#A6EEB0";break;
                case "peach":color="#FFB987";break;
                case "blue":color="#9FC8FF";break;
                case "pink":color="#F2B7D4";break;
            }
        }
        v.setInt(first?R.id.widget_dot1:R.id.widget_dot2,"setColorFilter",Color.parseColor(color));
    }
    private WidgetRenderer(){}
}
