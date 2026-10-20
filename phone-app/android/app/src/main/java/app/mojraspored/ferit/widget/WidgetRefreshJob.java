package app.mojraspored.ferit.widget;

import android.app.job.*;
import android.content.*;
import android.net.*;
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
        if(!ScheduleWidgetProvider.hasWidgets(c)) return;
        String key=WidgetData.selection(WidgetStore.preferences(c));
        if(!key.matches("\\d+-\\d+")){WidgetRuntime.render(c);return;}
        long now=System.currentTimeMillis();
        if(WidgetStore.status(c).getLong("refreshStarted",0)>now-15000)return;
        WidgetStore.status(c).edit().putString("scope",key+":"+WidgetData.monday(WidgetData.today(now)))
            .putLong("refreshStarted",now).putString("notice","").apply();
        WidgetRuntime.render(c);
        // Deadline allows a manual offline attempt to finish with an honest saved-data status.
        c.getSystemService(JobScheduler.class).schedule(new JobInfo.Builder(MANUAL,new ComponentName(c,WidgetRefreshJob.class))
            .setOverrideDeadline(0).build());
    }
    @Override public boolean onStartJob(JobParameters params) {
        Request request=new Request();
        requests.put(params.getJobId(),request);
        executor.execute(()->{
            synchronized(NETWORK_LOCK) {
                try { if(!request.stopped && ScheduleWidgetProvider.hasWidgets(this))refresh(request); }
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
    private void refresh(Request request) {
        JSONObject prefs=WidgetStore.preferences(this);
        String primary=WidgetData.selection(prefs), date=WidgetData.today(System.currentTimeMillis()), week=WidgetData.monday(date);
        if(!primary.matches("\\d+-\\d+"))return;
        String scope=primary+":"+week;
        WidgetStore.status(this).edit().putString("scope",scope).putLong("refreshStarted",System.currentTimeMillis()).apply();
        WidgetRuntime.postRender(this);
        boolean failed=false, pending=false;
        ConnectivityManager cm=getSystemService(ConnectivityManager.class);
        NetworkCapabilities network=cm.getNetworkCapabilities(cm.getActiveNetwork());
        if(network==null || !network.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET))failed=true;
        else for(String key:WidgetData.keys(prefs)){
            if(request.stopped)return;
            try {
                JSONObject schedule=FeritWidgetParser.parse(download(WidgetData.SOURCE+"/"+week+"/"+key,request),key,week);
                if(request.stopped)return;
                // Do not replace a newer foreground download with an older response.
                String cacheKey=WidgetData.cacheKey(key,date);
                JSONObject existing=WidgetData.object(WidgetStore.shared(this).getString(cacheKey,null));
                if(!WidgetData.validSchedule(existing,key,date) ||
                    Instant.parse(existing.getString("fetchedAt")).compareTo(Instant.parse(schedule.getString("fetchedAt")))<=0)
                    WidgetStore.shared(this).edit().putString(cacheKey,schedule.toString()).commit();
            } catch(FeritWidgetParser.InPreparation e){pending=true;}
            catch(Exception e){failed=true;}
        }
        // Preferences may have changed while the network request was in flight.
        if(request.stopped || !primary.equals(WidgetData.selection(WidgetStore.preferences(this))))return;
        String notice=pending ? "FERIT: raspored je još u izradi" : failed ? "Bez nove provjere · spremljeni podaci" : "";
        WidgetStore.status(this).edit().putString("scope",scope).putString("notice",notice)
            .putLong("lastAttempt",System.currentTimeMillis())
            .putLong("lastSuccess",failed||pending ? WidgetStore.status(this).getLong("lastSuccess",0) : System.currentTimeMillis()).apply();
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
