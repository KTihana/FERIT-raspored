package app.mojraspored.ferit.widget;

import org.junit.Test;
import org.json.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.junit.Assert.*;

public class WidgetDataTest {
    private JSONObject lesson(String id,String start,String end) throws Exception{
        return new JSONObject().put("id",id).put("scheduleKey","3-53").put("date","2026-10-20")
            .put("start",start).put("end",end).put("title","Programsko inženjerstvo").put("courseCode","SR5-02")
            .put("room","K3-12").put("type","LV").put("typeLabel","LV").put("teacher","").put("group","SR-LV3").put("progress","");
    }
    private List<JSONObject> day() throws Exception{return Arrays.asList(lesson("a","10:00","12:00"),lesson("b","12:15","13:00"),lesson("c","13:15","15:00"));}
    private long at(String clock){return WidgetData.time("2026-10-20",clock);}
    private JSONObject prefs() throws Exception{return new JSONObject().put("selection",new JSONObject().put("key","3-53"));}
    @Test public void progressIsDerivedFromWallTimeNotTickCount() throws Exception{
        WidgetData.State s=WidgetData.state(day(),at("11:15"));
        assertTrue(s.active);assertEquals(6250,s.progress);assertEquals(45,s.remaining);assertEquals(2,s.next.size());
        // No intermediate ticks: wake directly at 11:55.
        s=WidgetData.state(day(),at("11:55"));
        assertEquals(9583,s.progress);assertEquals(5,s.remaining);
    }
    @Test public void exactBoundariesAndFreeTime() throws Exception{
        WidgetData.State s=WidgetData.state(day(),at("09:41"));
        assertFalse(s.active);assertEquals("Za 19 min",s.status);
        s=WidgetData.state(day(),at("10:00"));assertTrue(s.active);assertEquals(0,s.progress);
        s=WidgetData.state(day(),at("12:00"));assertFalse(s.active);assertEquals("b",s.hero.getString("id"));assertEquals(15,s.remaining);
        s=WidgetData.state(day(),at("12:15"));assertTrue(s.active);assertEquals(0,s.progress);
        s=WidgetData.state(day(),at("15:00"));assertNull(s.hero);assertEquals("Gotovo za danas",s.emptyTitle);
    }
    @Test public void clockCorrectionsRecalculateWithoutDrift() throws Exception{
        assertEquals(6250,WidgetData.state(day(),at("11:15")).progress);
        assertEquals(5000,WidgetData.state(day(),at("11:00")).progress);
    }
    @Test public void zagrebDatesDoNotDependOnPhoneTimezone() throws Exception{
        TimeZone original=TimeZone.getDefault();
        try{TimeZone.setDefault(TimeZone.getTimeZone("America/Los_Angeles"));
            assertEquals("2026-10-20",WidgetData.today(at("00:01")));
            assertEquals(6250,WidgetData.state(day(),at("11:15")).progress);
            assertEquals(25*60*60*1000L,WidgetData.time("2026-10-26","00:00")-WidgetData.time("2026-10-25","00:00"));
        }finally{TimeZone.setDefault(original);}
    }
    @Test public void emptyDayAndCroatianDate() throws Exception{
        WidgetData.State s=WidgetData.state(Collections.emptyList(),at("11:15"));
        assertEquals("Danas nema nastave",s.emptyTitle);assertEquals("20. listopada",s.dateLabel);
    }
    @Test public void personalMovesHiddenAndGroupSelections() throws Exception{
        JSONObject p=prefs(), a=lesson("a","10:00","12:00"), b=lesson("b","12:15","13:00");
        JSONObject moved=lesson("other-week","14:00","16:00"), original=new JSONObject(moved.toString()).put("date","2026-10-13");
        p.put("overrides",new JSONObject().put("a",new JSONObject().put("original",a).put("hidden",true))
            .put("other-week",new JSONObject().put("original",original).put("edited",moved)));
        p.put("groups",new JSONObject().put("3-53:SR5-02:LV","SR-LV3"));
        p.put("personal",new JSONArray().put(lesson("mine","16:00","17:00").put("personal",true).put("group","anything")));
        List<JSONObject> list=WidgetData.personalLessons(p,Arrays.asList(a,b),"2026-10-20");
        assertEquals(Arrays.asList("b","other-week","mine"),ids(list));
        p.getJSONObject("groups").put("3-53:SR5-02:LV","SR-LV1");
        assertEquals(Collections.singletonList("mine"),ids(WidgetData.personalLessons(p,Arrays.asList(a,b),"2026-10-20")));
    }
    @Test public void repeatingRespectsTypeAndSourceIdentity() throws Exception{
        JSONObject p=prefs();
        JSONObject course=new JSONObject().put("scheduleKey","2-53").put("courseCode","SR5-02").put("title","Programsko inženjerstvo").put("selectedTypes",new JSONArray().put("PR"));
        p.put("repeating",new JSONObject().put("3-53",new JSONObject().put("courses",new JSONArray().put(course))));
        JSONObject lab=lesson("lab","10:00","12:00").put("scheduleKey","2-53");
        JSONObject lecture=lesson("lecture","13:00","15:00").put("scheduleKey","2-53").put("type","PR");
        assertEquals(Collections.singletonList("lecture"),ids(WidgetData.personalLessons(p,Arrays.asList(lab,lecture),"2026-10-20")));
        course.put("selectedTypes",new JSONArray());
        assertTrue(WidgetData.personalLessons(p,Arrays.asList(lab,lecture),"2026-10-20").isEmpty());
    }
    @Test public void overlapRetainsBothClasses() throws Exception{
        List<JSONObject> list=Arrays.asList(lesson("a","10:00","12:00"),lesson("b","11:00","13:00"));
        WidgetData.State s=WidgetData.state(list,at("11:15"));
        assertEquals("a",s.hero.getString("id"));assertEquals("b",s.next.get(0).getString("id"));
    }
    private List<String> ids(List<JSONObject> list){List<String> ids=new ArrayList<>();for(JSONObject l:list)ids.add(l.optString("id"));return ids;}
    @Test public void nativeParserMatchesInstalledAppOnAllFixtures() throws Exception{
        String json=new String(getClass().getResourceAsStream("/widget-parser-expectations.json").readAllBytes(),StandardCharsets.UTF_8);
        JSONObject expected=new JSONObject(json);
        for(Iterator<String> it=expected.keys();it.hasNext();){
            String file=it.next();JSONObject e=expected.getJSONObject(file);
            String html=new String(Files.readAllBytes(Paths.get(System.getProperty("feritFixtures"),file)),StandardCharsets.UTF_8);
            JSONObject actual=FeritWidgetParser.parse(html,e.getString("key"),e.getString("week"));
            assertEquals(file,e.getString("teachingWeek"),actual.getString("teachingWeek"));
            JSONArray lessons=e.getJSONArray("lessons"),got=actual.getJSONArray("lessons");
            assertEquals(file,lessons.length(),got.length());
            for(int i=0;i<lessons.length();i++)assertEquals(file+" lesson "+i,canonical(lessons.getJSONObject(i)),canonical(got.getJSONObject(i)));
        }
    }
    private Object canonical(Object value) throws Exception{
        if(value instanceof JSONObject){
            Map<String,Object> result=new TreeMap<>();JSONObject o=(JSONObject)value;
            for(Iterator<String> it=o.keys();it.hasNext();){String k=it.next();result.put(k,canonical(o.get(k)));}
            return result;
        }
        if(value instanceof JSONArray){
            List<Object> result=new ArrayList<>();JSONArray a=(JSONArray)value;
            for(int i=0;i<a.length();i++)result.add(canonical(a.get(i)));
            return result;
        }
        return value;
    }
    @Test public void rejectsWrongWeekEvenWhenItHasNoLessons() throws Exception{
        String html="<div class='dan'><div class='naziv-dan'>20.10.2026</div></div>";
        try{FeritWidgetParser.parse(html,"3-53","2026-10-26");fail("Wrong week accepted");}catch(IllegalArgumentException expected){}
    }
    @Test public void distinguishesPreparationAndInvalidHtml() throws Exception{
        try{FeritWidgetParser.parse("<h2>Raspored za ovaj tjedan je u izradi.</h2>","3-53","2026-10-19");fail();}catch(FeritWidgetParser.InPreparation expected){}
        try{FeritWidgetParser.parse("<html>Error</html>","3-53","2026-10-19");fail();}catch(IllegalArgumentException expected){}
    }
    @Test public void rejectsWrongStudyAndBrokenTime() throws Exception{
        try{FeritWidgetParser.parse("<a class='selected' href='/2-53#raspored'>Other</a><div class='dan'><div class='naziv-dan'>20.10.2026</div></div>","3-53","2026-10-19");fail();}catch(IllegalArgumentException expected){}
        try{FeritWidgetParser.parse("<div class='dan'><div class='naziv-dan'>20.10.2026</div><div class='blokovi'>Broken event</div></div>","3-53","2026-10-19");fail();}catch(IllegalArgumentException expected){}
    }
}
