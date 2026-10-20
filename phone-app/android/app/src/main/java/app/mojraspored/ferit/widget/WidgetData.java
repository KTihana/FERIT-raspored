package app.mojraspored.ferit.widget;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.*;

/** Shared-preference schema is the same one used by the installed React app. */
public final class WidgetData {
    public static final ZoneId ZONE = ZoneId.of("Europe/Zagreb");
    public static final String SOURCE = "https://www.ferit.unios.hr/studenti/raspored-nastave-i-ispita";
    public static final String PREFS_KEY = "ferit-personal-v1";
    public static final Locale HR = Locale.forLanguageTag("hr-HR");

    public static JSONObject object(String json) {
        try { return new JSONObject(json == null ? "{}" : json); }
        catch (JSONException e) { return new JSONObject(); }
    }
    public static JSONObject obj(JSONObject value, String key) {
        JSONObject result = value.optJSONObject(key);
        return result == null ? new JSONObject() : result;
    }
    public static List<JSONObject> objects(JSONArray array) {
        List<JSONObject> result = new ArrayList<>();
        if (array != null) for (int i = 0; i < array.length(); i++) {
            JSONObject o = array.optJSONObject(i);
            if (o != null) result.add(o);
        }
        return result;
    }
    public static String selection(JSONObject prefs) { return obj(prefs, "selection").optString("key"); }
    public static String today(long now) { return Instant.ofEpochMilli(now).atZone(ZONE).toLocalDate().toString(); }
    public static String monday(String date) {
        return LocalDate.parse(date).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).toString();
    }
    public static long time(String date, String clock) {
        return LocalDate.parse(date).atTime(LocalTime.parse(clock)).atZone(ZONE).toInstant().toEpochMilli();
    }
    public static String cacheKey(String key, String date) { return "ferit-week:" + key + ":" + monday(date); }
    public static String course(JSONObject lesson) {
        String code = lesson.optString("courseCode");
        return lesson.optString("scheduleKey") + ":" + (code.isEmpty() ? lesson.optString("title") : code);
    }
    public static List<JSONObject> repeating(JSONObject prefs) {
        String primary = selection(prefs);
        JSONObject settings = obj(obj(prefs, "repeating"), primary);
        if (!settings.optBoolean("enabled", true)) return Collections.emptyList();
        List<JSONObject> result = new ArrayList<>();
        for (JSONObject c : objects(settings.optJSONArray("courses"))) {
            String key = c.optString("scheduleKey");
            JSONArray types = c.optJSONArray("selectedTypes");
            if (!key.matches("\\d+-\\d+") || primary.equals(key) || (types != null && types.length() == 0)) continue;
            // Saved choices are authored by the app's programme-aware picker.
            try {
                if (Integer.parseInt(key.split("-")[0]) != Integer.parseInt(primary.split("-")[0]) - 1) continue;
            } catch (RuntimeException e) { continue; }
            result.add(c);
        }
        return result;
    }
    public static Set<String> keys(JSONObject prefs) {
        Set<String> keys = new LinkedHashSet<>();
        String key = selection(prefs);
        if (key.matches("\\d+-\\d+")) keys.add(key);
        for (JSONObject c : repeating(prefs)) keys.add(c.optString("scheduleKey"));
        return keys;
    }
    public static boolean validSchedule(JSONObject schedule, String key, String date) {
        try {
            if (!schedule.optString("sourceUrl").equals(SOURCE + "/" + monday(date) + "/" + key)
                || !(schedule.opt("lessons") instanceof JSONArray)
                || !schedule.has("teachingWeek")) return false;
            Instant.parse(schedule.getString("fetchedAt"));
            JSONArray lessons = schedule.getJSONArray("lessons");
            for (int i = 0; i < lessons.length(); i++) {
                JSONObject l = lessons.getJSONObject(i);
                if (!key.equals(l.getString("scheduleKey")) || !monday(l.getString("date")).equals(monday(date))) return false;
                for (String field : new String[]{"id","title","room","type","typeLabel","teacher","group","progress","courseCode","start","end"})
                    if (!(l.opt(field) instanceof String)) return false;
                if (!l.getString("start").matches("([01]\\d|2[0-3]):[0-5]\\d") || !l.getString("end").matches("([01]\\d|2[0-3]):[0-5]\\d")) return false;
                if (time(l.getString("date"), l.getString("end")) <= time(l.getString("date"), l.getString("start"))) return false;
            }
            return true;
        } catch (Exception e) { return false; }
    }
    private static boolean typeSelected(JSONObject lesson, JSONObject c) {
        JSONArray types = c.optJSONArray("selectedTypes");
        if (types == null) return true;
        String type = lesson.optString("type");
        if (type.equals("OSTALO")) type += ":" + lesson.optString("typeLabel");
        for (int i = 0; i < types.length(); i++) if (type.equals(types.optString(i))) return true;
        return false;
    }
    /** Apply removals/moves before filtering dates, including moves from another week. */
    public static List<JSONObject> personalLessons(JSONObject prefs, List<JSONObject> source, String date) {
        String primary = selection(prefs);
        JSONObject overrides = obj(prefs, "overrides"), groups = obj(prefs, "groups");
        Map<String, JSONObject> courses = new HashMap<>();
        for (JSONObject c : repeating(prefs)) courses.put(course(c), c);
        Set<String> allowed = keys(prefs), seen = new HashSet<>();
        List<JSONObject> candidates = new ArrayList<>();
        for (JSONObject lesson : source) {
            if (!allowed.contains(lesson.optString("scheduleKey"))) continue;
            String id = lesson.optString("id"); seen.add(id);
            JSONObject o = obj(overrides, id);
            if (o.optBoolean("hidden")) continue;
            JSONObject edited = o.optJSONObject("edited");
            if (edited == null) candidates.add(lesson);
            else {
                JSONObject copy = object(edited.toString());
                try {
                    for (String field : new String[]{"type","typeLabel","teacher","group","courseCode","progress"})
                        copy.put(field, lesson.optString(field));
                } catch (JSONException ignored) {}
                candidates.add(copy);
            }
        }
        for (Iterator<String> it = overrides.keys(); it.hasNext();) {
            String id = it.next(); JSONObject o = obj(overrides, id), original = obj(o, "original");
            if (!seen.contains(id) && allowed.contains(original.optString("scheduleKey")) && !o.optBoolean("hidden") && o.optJSONObject("edited") != null)
                candidates.add(o.optJSONObject("edited"));
        }
        for (JSONObject l : objects(prefs.optJSONArray("personal"))) if (primary.equals(l.optString("scheduleKey"))) candidates.add(l);
        List<JSONObject> result = new ArrayList<>();
        for (JSONObject l : candidates) {
            if (!date.equals(l.optString("date"))) continue;
            if (!primary.equals(l.optString("scheduleKey"))) {
                JSONObject original = obj(obj(overrides, l.optString("id")), "original");
                JSONObject c = courses.get(course(original.length() == 0 ? l : original));
                if (c == null || !typeSelected(l, c)) continue;
            }
            String selectedGroup = groups.optString(course(l) + ":" + l.optString("type"));
            if (!l.optBoolean("personal") && !selectedGroup.isEmpty() && !selectedGroup.equals(l.optString("group"))) continue;
            try { if (time(date, l.getString("end")) <= time(date, l.getString("start"))) continue; }
            catch (Exception e) { continue; }
            result.add(l);
        }
        result.sort(Comparator.comparing((JSONObject l) -> l.optString("start")).thenComparing(l -> l.optString("id")));
        return result;
    }
    public static final class State {
        public String date, dateLabel, status, footer, emptyTitle, emptyBody;
        public JSONObject hero;
        public List<JSONObject> next = new ArrayList<>();
        public boolean active;
        public int progress, remaining, total;
        public long end, nextChange;
    }
    public static State state(List<JSONObject> lessons, long now) {
        State s = new State();
        s.date = today(now);
        LocalDate day=LocalDate.parse(s.date);
        String[] months={"siječnja","veljače","ožujka","travnja","svibnja","lipnja","srpnja","kolovoza","rujna","listopada","studenoga","prosinca"};
        s.dateLabel = day.getDayOfMonth()+". "+months[day.getMonthValue()-1];
        s.total = lessons.size();
        s.nextChange = LocalDate.parse(s.date).plusDays(1).atStartOfDay(ZONE).toInstant().toEpochMilli();
        List<JSONObject> remaining = new ArrayList<>();
        for (JSONObject l : lessons) {
            if (!s.date.equals(l.optString("date"))) continue;
            long start = time(s.date, l.optString("start")), end = time(s.date, l.optString("end"));
            if (end > now) remaining.add(l);
            if (start > now) s.nextChange = Math.min(s.nextChange, start);
            if (end > now) s.nextChange = Math.min(s.nextChange, end);
        }
        if (remaining.isEmpty()) {
            s.emptyTitle = lessons.isEmpty() ? "Danas nema nastave" : "Gotovo za danas";
            s.emptyBody = lessons.isEmpty() ? "Uživaj u slobodnom danu." : "Svi današnji termini su završili.";
            s.footer = lessons.isEmpty() ? "Nema termina danas" : "Svi termini završeni";
            return s;
        }
        s.hero = remaining.remove(0);
        long start = time(s.date, s.hero.optString("start"));
        s.end = time(s.date, s.hero.optString("end"));
        s.active = now >= start;
        s.progress = s.active ? (int)Math.max(0, Math.min(10000, (now-start)*10000/(s.end-start))) : 0;
        s.remaining = (int)Math.max(0, ((s.active ? s.end : start)-now+59999)/60000);
        s.status = s.active ? "U tijeku" : "Za " + duration(s.remaining);
        s.next = remaining;
        s.footer = s.active ? "Još " + remaining.size() + " " + termWord(remaining.size()) + " nakon ovog"
            : (remaining.size()+1) + " " + termWord(remaining.size()+1) + " danas";
        if(s.active&&remaining.isEmpty())s.footer="Posljednji termin danas";
        return s;
    }
    public static String termWord(int count) { return count % 10 == 1 && count % 100 != 11 ? "termin" : "termina"; }
    public static String duration(long minutes) {
        if (minutes < 60) return Math.max(0, minutes) + " min";
        return minutes / 60 + " h" + (minutes % 60 == 0 ? "" : " " + minutes % 60 + " min");
    }
    private WidgetData() {}
}
