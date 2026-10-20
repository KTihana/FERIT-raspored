package app.mojraspored.ferit.widget;

import org.json.*;
import org.jsoup.Jsoup;
import org.jsoup.nodes.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.*;

/** Native reader for hourly refresh, with parity fixtures against lib/ferit.ts. */
public final class FeritWidgetParser {
    public static final class InPreparation extends Exception {}
    private static String match(String value, String expression, int group) {
        Matcher m = Pattern.compile(expression).matcher(value);
        return m.find() ? m.group(group) : "";
    }
    private static String text(Element element) { return element == null ? "" : element.text().replace('\u00a0',' ').replaceAll("\\s+", " ").trim(); }
    private static List<String> lines(Element element) {
        List<String> result = new ArrayList<>();
        if (element == null) return result;
        for (String line : element.html().split("(?i)<br\\s*/?>")) {
            String clean = Jsoup.parseBodyFragment(line).text().replace('\u00a0',' ').replaceAll("\\s+", " ").trim();
            if (!clean.isEmpty()) result.add(clean);
        }
        return result;
    }
    public static JSONObject parse(String html, String key, String week) throws Exception {
        if (!key.matches("\\d+-\\d+") || !week.equals(WidgetData.monday(week))) throw new IllegalArgumentException("Neispravan raspored.");
        Document doc = Jsoup.parse(html);
        Element selected = doc.selectFirst("a.selected[href$='#raspored']");
        if (selected != null) {
            String selectedKey = match(selected.attr("href"), "/(\\d+-\\d+)#raspored", 1);
            if (!selectedKey.isEmpty() && !selectedKey.equals(key)) throw new IllegalArgumentException("FERIT je vratio drugi raspored.");
        }
        if (doc.select("div.dan").isEmpty()) {
            for (Element h : doc.select("h1,h2,h3,h4,h5,h6"))
                if (text(h).matches("(?i)Raspored za ovaj tjedan je u izradi\\.?")) throw new InPreparation();
            throw new IllegalArgumentException("Format rasporeda nije prepoznat.");
        }
        JSONArray lessons = new JSONArray();
        boolean dated = false;
        String url = WidgetData.SOURCE + "/" + week + "/" + key;
        for (Element day : doc.select("div.dan")) {
            String heading = text(day.selectFirst(".naziv-dan"));
            Matcher dateMatch = Pattern.compile("(\\d{2})\\.(\\d{2})\\.(\\d{4})").matcher(heading);
            if (!dateMatch.find()) throw new IllegalArgumentException("Nedostaje datum rasporeda.");
            String date = dateMatch.group(3)+"-"+dateMatch.group(2)+"-"+dateMatch.group(1);
            LocalDate.parse(date);
            if (!WidgetData.monday(date).equals(week)) throw new IllegalArgumentException("FERIT je vratio drugi tjedan.");
            dated = true;
            for (Element block : day.select("div.blokovi")) {
                Element details = block.selectFirst("span.hide");
                List<String> detailLines = lines(details), headline = lines(block.selectFirst("p"));
                String joined = String.join(" ", detailLines);
                Matcher range = Pattern.compile("(\\d{1,2}:\\d{2})\\s*[-–]\\s*(\\d{1,2}:\\d{2})").matcher(joined);
                if (!range.find()) throw new IllegalArgumentException("Nedostaje vrijeme termina.");
                String start = range.group(1), end = range.group(2);
                if (start.length()==4) start="0"+start;
                if (end.length()==4) end="0"+end;
                Element course = details == null ? null : details.selectFirst("a[href*=upisi],a[href*=studijski]");
                String fullTitle = course == null ? (headline.isEmpty() ? "Nastava" : headline.get(0)) : text(course);
                String code = match(fullTitle, "\\(([^()]+)\\)$", 1);
                String title = code.isEmpty() ? fullTitle : fullTitle.substring(0, fullTitle.lastIndexOf('(')).trim();
                String room = headline.size()<2 ? "" : headline.get(1).replaceAll("\\([^)]*\\)", "").trim();
                String typeLine = detailLines.isEmpty() ? "" : detailLines.get(0);
                String type = match(typeLine, "^(PR|AV|LV|KV|S|V)\\b", 1);
                if (type.isEmpty()) type=match(typeLine, "^([A-ZČĆŽŠĐ][A-ZČĆŽŠĐ0-9_]{0,15})\\s*[-–—:]", 1);
                if (type.isEmpty()) type=typeLine.toLowerCase(WidgetData.HR).matches(".*\\bispit\\b.*") ? "ISPIT" : "OSTALO";
                String group="", progress="";
                for (String line : detailLines) {
                    if (line.startsWith("Otvori grupu ")) group=line.substring(13);
                    if (line.matches("\\(\\d+\\s*/\\s*\\d+\\)")) progress=line;
                }
                String sourceId=match(block.outerHtml(), "\\bblok(\\d+)", 1);
                if(sourceId.isEmpty()) sourceId=title+"-"+range.group(1)+"-"+room+"-"+group;
                JSONObject l = new JSONObject();
                l.put("id",key+":"+date+":"+sourceId).put("sourceId",sourceId).put("scheduleKey",key).put("date",date)
                    .put("title",title).put("courseCode",code).put("start",start).put("end",end).put("room",room)
                    .put("type",type).put("typeLabel",typeLine).put("teacher",details==null ? "" : text(details.selectFirst("a[href*=imenik]")))
                    .put("group",group).put("progress",progress).put("sourceUrl",url);
                // Preserve the full web parser's annotation format in the shared offline cache.
                LinkedHashSet<String> tags = new LinkedHashSet<>();
                if (details != null) {
                    for (String raw : details.html().split("(?i)<br\\s*/?>")) {
                        Document fragment=Jsoup.parseBodyFragment(raw);
                        Element a=fragment.selectFirst("a[href*=upisi],a[href*=studijski]");
                        if (a!=null) {
                            a.remove();
                            String annotation=text(fragment.body());
                            String metadata=match(annotation,"^(\\((?:izborni|obvezni)\\))\\s*",1);
                            if(!metadata.isEmpty()){tags.add(metadata);annotation=annotation.substring(metadata.length()).trim();}
                            if(!annotation.isEmpty()) tags.add(annotation);
                        }
                    }
                    for(Element i:block.select("p i")) if(!text(i).isEmpty())tags.add(text(i));
                    for(int i=2;i<headline.size();i++){
                        String t=headline.get(i).replaceAll("\\s*\\(\\d+\\s*/\\s*\\d+\\)\\s*$","").trim();
                        if(!t.isEmpty())tags.add(t);
                    }
                    String[] rawLines=details.html().split("(?i)<br\\s*/?>");
                    for(int i=1;i<rawLines.length;i++){
                        String raw=rawLines[i], t=Jsoup.parseBodyFragment(raw).text().trim();
                        if(raw.matches("(?s).*href=[\"'][^\"']*(upisi|studijski|imenik|google\\.com/calendar).*"))continue;
                        if(t.isEmpty()||t.matches("\\d+")||t.matches("\\(\\d+\\s*/\\s*\\d+\\)")||t.startsWith("Otvori grupu ")||t.matches("^\\d{1,2}:\\d{2}\\s*[-–].*"))continue;
                        tags.add(t);
                    }
                }
                JSONArray unique=new JSONArray();Set<String> seen=new HashSet<>();
                for(String t:tags)if(seen.add(t.toLowerCase(WidgetData.HR)))unique.put(t);
                if(unique.length()>0)l.put("tags",unique);
                lessons.put(l);
            }
        }
        if(!dated)throw new IllegalArgumentException("Nedostaju datumi rasporeda.");
        JSONObject schedule = new JSONObject().put("lessons",lessons).put("sourceUrl",url)
            .put("fetchedAt",Instant.now().toString()).put("teachingWeek",text(doc.selectFirst("#kalendar")));
        if(!WidgetData.validSchedule(schedule,key,week))throw new IllegalArgumentException("Neispravan raspored.");
        return schedule;
    }
    private FeritWidgetParser() {}
}
