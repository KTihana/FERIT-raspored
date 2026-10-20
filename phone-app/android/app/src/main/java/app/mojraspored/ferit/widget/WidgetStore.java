package app.mojraspored.ferit.widget;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;
import java.util.*;

public final class WidgetStore {
    public static SharedPreferences shared(Context c) { return c.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE); }
    public static SharedPreferences status(Context c) { return c.getSharedPreferences("ferit-widget", Context.MODE_PRIVATE); }
    public static JSONObject preferences(Context c) { return WidgetData.object(shared(c).getString(WidgetData.PREFS_KEY, null)); }
    public static String date(Context c, int widgetId, long now) {
        return WidgetData.displayDate(status(c).getString("day:"+widgetId,""),now);
    }
    public static void selectDate(Context c, int widgetId, String date, long now) {
        status(c).edit().putString("day:"+widgetId,WidgetData.displayDate(date,now)).apply();
    }
    public static boolean missing(Context c, long now) {
        for(String week:WidgetData.weeks(now)) for(String key:WidgetData.keys(preferences(c)))
            if(!WidgetData.validSchedule(WidgetData.object(shared(c).getString(WidgetData.cacheKey(key,week),null)),key,week))return true;
        return false;
    }
    public static final class Snapshot {
        public WidgetData.State state;
        public boolean configured, available, partial, refreshing;
        public String notice = "";
    }
    public static Snapshot read(Context context, long now) {
        return read(context,now,WidgetData.today(now));
    }
    public static Snapshot read(Context context, long now, String selectedDate) {
        Snapshot result = new Snapshot();
        JSONObject prefs = preferences(context);
        String primary = WidgetData.selection(prefs), date = WidgetData.displayDate(selectedDate,now);
        result.configured = primary.matches("\\d+-\\d+");
        List<JSONObject> source = new ArrayList<>();
        long oldestFetch=Long.MAX_VALUE;
        for (String key : WidgetData.keys(prefs)) {
            JSONObject schedule = WidgetData.object(shared(context).getString(WidgetData.cacheKey(key,date), null));
            boolean valid = WidgetData.validSchedule(schedule,key,date);
            if (key.equals(primary)) result.available = valid;
            if (valid) {
                source.addAll(WidgetData.objects(schedule.optJSONArray("lessons")));
                oldestFetch=Math.min(oldestFetch,java.time.Instant.parse(schedule.optString("fetchedAt")).toEpochMilli());
            }
            else if (!key.equals(primary)) result.partial = true;
        }
        result.state = WidgetData.state(WidgetData.personalLessons(prefs,source,date),now,date);
        SharedPreferences status = status(context);
        String scope = primary+":"+WidgetData.monday(date);
        result.refreshing = primary.equals(status.getString("refreshPrimary","")) && status.getLong("refreshStarted",0)>now-120000;
        if(status.contains("attempt:"+scope) || scope.equals(status.getString("scope",""))) {
            // An interrupted job cannot leave a permanent spinning/refreshing state.
            result.notice = status.getString("notice:"+scope,status.getString("notice",""));
            if(result.available&&!result.partial&&oldestFetch>status.getLong("attempt:"+scope,status.getLong("lastAttempt",0)))result.notice="";
        }
        if(!result.configured){
            result.state.hero=null;
            result.state.emptyTitle="Tvoj raspored na početnom zaslonu";
            result.state.emptyBody="Otvori aplikaciju i odaberi studij i godinu.";
            result.state.footer="Dodirni za postavljanje";
        } else if(!result.available && result.state.hero==null) {
            result.state.emptyTitle=result.notice.contains("izradi") ? "Raspored je u izradi" : "Raspored još nije spremljen";
            result.state.emptyBody="Dodirni osvježi za ovaj tjedan.";
            result.state.footer="Otvori raspored";
        } else if(result.partial && result.state.hero==null) {
            result.state.emptyTitle="Dio rasporeda nije dostupan";
            result.state.emptyBody="Osvježi za termine ponavljačkih predmeta.";
            result.state.footer="Prikazani su spremljeni podaci";
        }
        return result;
    }
    private WidgetStore(){}
}
