package io.github.lcymxm.classflow;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridgePlugin.class);
        registerPlugin(SystemCalendarPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
