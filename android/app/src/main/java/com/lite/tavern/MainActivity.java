package com.lite.tavern;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered before super.onCreate() so the plugins exist from the first
        // bridge call: the update check and the inset sync both run as soon as
        // the UI mounts.
        registerPlugin(LiteUpdaterPlugin.class);
        registerPlugin(LiteShellPlugin.class);
        super.onCreate(savedInstanceState);
        // Let the page paint behind the status and navigation bars.
        LiteShellPlugin.enableEdgeToEdge(this);
    }
}
