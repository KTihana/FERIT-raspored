package app.mojraspored.ferit;
import android.app.Application;
import app.mojraspored.ferit.widget.WidgetRuntime;

public class FeritApplication extends Application {
    @Override public void onCreate(){super.onCreate();WidgetRuntime.start(this);}
}
