package app.mojraspored.ferit.widget;

import android.app.job.*;
import android.content.*;
import android.net.*;
import android.os.PersistableBundle;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.concurrent.*;

/** The only widget path which accesses the network; the clock path is fully local. */
public class WidgetRefreshJob extends JobService {
    public static final int HOURLY=4101, MANUAL=4102;
    private static final Object NETWORK_LOCK = new Object();
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private static final class Request {
        volatile boolean stopped;
        volatile HttpURLConnection connection;
    }
    private final ConcurrentHashMap<Integer,Request> requests=new ConcurrentHashMap<>();
    public static void ensureHourly(Context c) {
        JobScheduler jobs=c.getSystemService(JobScheduler.class);
        if(jobs.getPendingJob(HOURLY)==null)
            jobs.schedule(new JobInfo.Builder(HOURLY,new ComponentName(c,WidgetRefreshJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true)
                .setPeriodic(60*60*1000L,5*60*1000L).build());
    }
    public static void request(Context c) {
        request(c,false);
    }
    public static void requestMissing(Context c) {
        if(WidgetStore.missing(c,System.currentTimeMillis()))request(c,true);
    }
    private static void request(Context c,boolean missingOnly) {
        if(!ScheduleWidgetProvider.hasWidgets(c)) return;
        String key=WidgetData.selection(WidgetStore.preferences(c));
        if(!key.matches("\\d+-\\d+")){WidgetRuntime.render(c);return;}
        long now=System.currentTimeMillis();
        if(WidgetStore.status(c).getLong("refreshStarted",0)>now-15000)return;
        if(missingOnly && WidgetStore.status(c).getLong("lastMissingAttempt",0)>now-60000)return;
        WidgetStore.status(c).edit().putString("scope",key+":"+WidgetData.monday(WidgetData.today(now)))
            .putString("refreshPrimary",key).putLong("refreshStarted",now).putString("notice","")
            .putLong("lastMissingAttempt",missingOnly?now:0).apply();
        WidgetRuntime.render(c);
        PersistableBundle extras=new PersistableBundle();extras.putBoolean("missingOnly",missingOnly);
        // Deadline allows a manual offline attempt to finish with an honest saved-data status.
        c.getSystemService(JobScheduler.class).schedule(new JobInfo.Builder(MANUAL,new ComponentName(c,WidgetRefreshJob.class))
            .setExtras(extras).setOverrideDeadline(0).build());
    }
    @Override public boolean onStartJob(JobParameters params) {
        Request request=new Request();
        requests.put(params.getJobId(),request);
        executor.execute(()->{
            synchronized(NETWORK_LOCK) {
                try { if(!request.stopped && ScheduleWidgetProvider.hasWidgets(this))refresh(request,params.getExtras().getBoolean("missingOnly",false)); }
                finally {
                    WidgetStore.status(this).edit().remove("refreshStarted").apply();
                    WidgetRuntime.postRender(this);
                    requests.remove(params.getJobId(),request);
                    if(!request.stopped)jobFinished(params,false);
                }
            }
        });
        return true;
    }
    private void refresh(Request request,boolean missingOnly) {
        JSONObject prefs=WidgetStore.preferences(this);
        long now=System.currentTimeMillis();
        String primary=WidgetData.selection(prefs), week=WidgetData.monday(WidgetData.today(now));
        if(!primary.matches("\\d+-\\d+"))return;
        String scope=primary+":"+week;
        WidgetStore.status(this).edit().putString("scope",scope).putString("refreshPrimary",primary).putLong("refreshStarted",now).apply();
        WidgetRuntime.postRender(this);
        boolean failed=false, pending=false;
        ConnectivityManager cm=getSystemService(ConnectivityManager.class);
        NetworkCapabilities network=cm.getNetworkCapabilities(cm.getActiveNetwork());
        boolean offline=network==null || !network.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        // Seven days span at most two FERIT weeks. Fetch each source week once in
        // the existing job; browsing individual days never adds another timer.
        for(String targetWeek:WidgetData.weeks(now)) {
          boolean weekFailed=false,weekPending=false;
          for(String key:WidgetData.keys(prefs)){
            if(request.stopped)return;
            String cacheKey=WidgetData.cacheKey(key,targetWeek);
            JSONObject existing=WidgetData.object(WidgetStore.shared(this).getString(cacheKey,null));
            if(missingOnly && WidgetData.validSchedule(existing,key,targetWeek))continue;
            if(offline){weekFailed=true;continue;}
            try {
                JSONObject schedule=FeritWidgetParser.parse(download(WidgetData.SOURCE+"/"+targetWeek+"/"+key,request),key,targetWeek);
                if(request.stopped)return;
                // Do not replace a newer foreground download with an older response.
                existing=WidgetData.object(WidgetStore.shared(this).getString(cacheKey,null));
                if(!WidgetData.validSchedule(existing,key,targetWeek) ||
                    Instant.parse(existing.getString("fetchedAt")).compareTo(Instant.parse(schedule.getString("fetchedAt")))<=0)
                    WidgetStore.shared(this).edit().putString(cacheKey,schedule.toString()).commit();
            } catch(FeritWidgetParser.InPreparation e){weekPending=true;}
            catch(Exception e){weekFailed=true;}
          }
          if(request.stopped || !primary.equals(WidgetData.selection(WidgetStore.preferences(this))))return;
          String targetScope=primary+":"+targetWeek;
          WidgetStore.status(this).edit().putString("notice:"+targetScope,notice(weekPending,weekFailed))
              .putLong("attempt:"+targetScope,System.currentTimeMillis()).apply();
          failed|=weekFailed;pending|=weekPending;
        }
        // Preferences may have changed while the network request was in flight.
        if(request.stopped || !primary.equals(WidgetData.selection(WidgetStore.preferences(this))))return;
        String notice=notice(pending,failed);
        WidgetStore.status(this).edit().putString("scope",scope).putString("notice",notice)
            .putLong("lastAttempt",System.currentTimeMillis())
            .putLong("lastSuccess",failed||pending ? WidgetStore.status(this).getLong("lastSuccess",0) : System.currentTimeMillis()).apply();
    }
    private static String notice(boolean pending,boolean failed) {
        return pending ? "FERIT: raspored je još u izradi" : failed ? "Bez nove provjere · spremljeni podaci" : "";
    }
    private String download(String address,Request request) throws IOException {
        URL url=new URL(address);
        for(int redirects=0;redirects<4;redirects++){
            if(!"https".equals(url.getProtocol()) || !"www.ferit.unios.hr".equals(url.getHost()))throw new IOException("Unexpected host");
            HttpURLConnection connection=(HttpURLConnection)url.openConnection();
            request.connection=connection;
            connection.setConnectTimeout(10000);connection.setReadTimeout(10000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept","text/html");
            connection.setRequestProperty("Cache-Control","no-cache");
            try {
                int code=connection.getResponseCode();
                if(code>=300 && code<400){String next=connection.getHeaderField("Location");if(next==null)throw new IOException("Missing redirect");url=new URL(url,next);continue;}
                if(code<200 || code>=300)throw new IOException("HTTP "+code);
                try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                    byte[] buffer=new byte[8192];int n;
                    while((n=in.read(buffer))!=-1){if(request.stopped)throw new IOException("Cancelled");out.write(buffer,0,n);if(out.size()>3*1024*1024)throw new IOException("Response too large");}
                    return out.toString(StandardCharsets.UTF_8.name());
                }
            } finally {connection.disconnect();request.connection=null;}
        }
        throw new IOException("Too many redirects");
    }
    @Override public boolean onStopJob(JobParameters params) {
        Request request=requests.get(params.getJobId());
        if(request!=null){request.stopped=true;HttpURLConnection current=request.connection;if(current!=null)current.disconnect();}
        return params.getJobId()==HOURLY;
    }
    @Override public void onDestroy(){
        for(Request request:requests.values()){request.stopped=true;HttpURLConnection current=request.connection;if(current!=null)current.disconnect();}
        executor.shutdownNow();super.onDestroy();
    }
}
