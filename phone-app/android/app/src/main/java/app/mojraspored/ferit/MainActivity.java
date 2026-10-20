package app.mojraspored.ferit;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import app.mojraspored.ferit.widget.ScheduleWidgetPlugin;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScheduleWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
