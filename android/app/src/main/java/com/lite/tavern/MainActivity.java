package com.lite.tavern;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered before super.onCreate() so the plugin exists from the first
        // bridge call: the update check runs as soon as the UI mounts.
        registerPlugin(LiteUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
