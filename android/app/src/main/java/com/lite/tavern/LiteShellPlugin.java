package com.lite.tavern;

import android.app.Activity;
import android.content.res.Configuration;
import android.graphics.Color;
import android.view.View;
import android.view.Window;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Edge-to-edge system bars for the Android shell.
 *
 * The window is laid out behind the status and navigation bars and both bars are
 * made transparent, so the app's own background (the aurora gradient) reaches the
 * screen edges instead of a black strip. The measured insets are pushed to the
 * web layer, which pads its content with them.
 *
 * This is the standard Android 11+/15+ approach and is what the Chinese OEM
 * alliance (ITGSA: Xiaomi, OPPO, vivo, Honor) asked apps to adopt by
 * 2026-10-31, so one implementation covers every domestic ROM; there is no
 * per-manufacturer code path. `statusBarColor`/`navigationBarColor` are still set
 * for Android 14 and older, where a transparent window only works together with
 * the colour being transparent as well.
 */
@CapacitorPlugin(name = "LiteShell")
public class LiteShellPlugin extends Plugin {

    private int top;
    private int bottom;
    private int left;
    private int right;
    private boolean measured;
    private boolean observing;

    /**
     * Draws the web view behind both system bars and clears their colour.
     * Call once, after the activity has its content view.
     */
    public static void enableEdgeToEdge(Activity activity) {
        Window window = activity.getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        // Deprecated on API 35+, but only ignored when targetSdk >= 35. This app
        // targets 34, where the colours still apply, so set them everywhere.
        //noinspection deprecation
        window.setStatusBarColor(Color.TRANSPARENT);
        //noinspection deprecation
        window.setNavigationBarColor(Color.TRANSPARENT);
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
        // Before the web layer reports the real theme, follow the system one so
        // the first frame does not show white icons on a light background.
        boolean night =
                (activity.getResources().getConfiguration().uiMode
                                & Configuration.UI_MODE_NIGHT_MASK)
                        == Configuration.UI_MODE_NIGHT_YES;
        controller.setAppearanceLightStatusBars(!night);
        controller.setAppearanceLightNavigationBars(!night);
    }

    @Override
    public void load() {
        observe();
    }

    /**
     * Starts listening for inset changes. Idempotent, and retried from
     * {@link #getInsets} in case the bridge had no web view yet at load time.
     */
    private void observe() {
        if (observing) return;
        View webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView == null) return;
        observing = true;
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
            publish(insets);
            // Never consume: the web view still lays itself out normally.
            return insets;
        });
        WindowInsetsCompat current = ViewCompat.getRootWindowInsets(webView);
        if (current != null) publish(current);
    }

    private void publish(WindowInsetsCompat insets) {
        Insets bars =
                insets.getInsets(
                        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
        // WindowInsets are physical pixels; the web layer works in CSS pixels
        // (dp), so divide by the display density. Without this a 152 px status
        // bar on a 3.25x screen becomes a 152 CSS px gap.
        float density = getContext().getResources().getDisplayMetrics().density;
        if (density <= 0f) density = 1f;
        int nextTop = Math.round(bars.top / density);
        int nextBottom = Math.round(bars.bottom / density);
        int nextLeft = Math.round(bars.left / density);
        int nextRight = Math.round(bars.right / density);
        if (measured
                && nextTop == top
                && nextBottom == bottom
                && nextLeft == left
                && nextRight == right) {
            return;
        }
        top = nextTop;
        bottom = nextBottom;
        left = nextLeft;
        right = nextRight;
        measured = true;
        notifyListeners("insets", payload());
    }

    private JSObject payload() {
        JSObject data = new JSObject();
        data.put("top", top);
        data.put("bottom", bottom);
        data.put("left", left);
        data.put("right", right);
        return data;
    }

    /** Current system-bar insets in CSS pixels (density independent). */
    @PluginMethod
    public void getInsets(PluginCall call) {
        observe();
        if (!measured) {
            WindowInsetsCompat insets =
                    ViewCompat.getRootWindowInsets(getActivity().getWindow().getDecorView());
            if (insets != null) publish(insets);
        }
        call.resolve(payload());
    }

    /**
     * Sets the status/navigation bar icon colour.
     *
     * `darkIcons: true` means "the background under the bars is light", which
     * asks the system for dark icons; it is what the light theme needs.
     */
    @PluginMethod
    public void setAppearance(PluginCall call) {
        boolean darkIcons = Boolean.TRUE.equals(call.getBoolean("darkIcons", false));
        getActivity()
                .runOnUiThread(
                        () -> {
                            Window window = getActivity().getWindow();
                            WindowInsetsControllerCompat controller =
                                    WindowCompat.getInsetsController(window, window.getDecorView());
                            controller.setAppearanceLightStatusBars(darkIcons);
                            controller.setAppearanceLightNavigationBars(darkIcons);
                            call.resolve();
                        });
    }
}
