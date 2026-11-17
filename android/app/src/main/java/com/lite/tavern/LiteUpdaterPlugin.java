package com.lite.tavern;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Downloads a release APK and hands it to the Android package installer.
 *
 * The download runs natively instead of through `fetch` in the WebView: a
 * release APK is ~100 MB, and streaming it through JavaScript would either hit
 * the 25 MB WebView XHR limit or keep several copies in memory. Native code
 * also sidesteps CORS, which a `github.com` -> `objects.githubusercontent.com`
 * redirect would otherwise trip.
 *
 * Nothing installs silently: Android only shows the package installer, and the
 * user still has to confirm. That is by design and cannot be bypassed without a
 * system signature or device-owner privileges.
 */
@CapacitorPlugin(name = "LiteUpdater")
public class LiteUpdaterPlugin extends Plugin {

    private static final int BUFFER_SIZE = 64 * 1024;
    private static final long PROGRESS_STEP = 512 * 1024;

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", canInstallPackages());
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            if (!canInstallPackages()) {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("无法打开安装权限设置：" + describe(error));
        }
    }

    /**
     * Fetches a small text resource (the version manifest).
     *
     * The WebView cannot do this itself: GitHub answers with a redirect to
     * objects.githubusercontent.com, which does not allow cross-origin reads.
     */
    @PluginMethod
    public void fetchText(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("缺少请求地址");
            return;
        }
        getBridge().execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(10_000);
                connection.setReadTimeout(15_000);
                connection.setRequestProperty("User-Agent", "LiteTavern-Updater");
                connection.setRequestProperty("Accept", "application/json");
                int status = connection.getResponseCode();
                String body = "";
                if (status >= 200 && status < 300) {
                    body = readText(connection.getInputStream(), 2 * 1024 * 1024);
                }
                JSObject result = new JSObject();
                result.put("status", status);
                result.put("body", body);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(describe(error));
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private static String readText(InputStream input, int limit) throws IOException {
        java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
        byte[] chunk = new byte[16 * 1024];
        int read;
        while ((read = input.read(chunk)) > 0) {
            if (buffer.size() + read > limit) throw new IOException("响应过大");
            buffer.write(chunk, 0, read);
        }
        return buffer.toString("UTF-8");
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String fileName = sanitize(call.getString("fileName", "update.apk"));
        String expected = call.getString("sha256", "");
        if (url == null || url.isEmpty()) {
            call.reject("缺少下载地址");
            return;
        }
        getBridge().execute(() -> {
            File target = null;
            try {
                File directory = new File(getContext().getCacheDir(), "updates");
                if (!directory.exists() && !directory.mkdirs()) {
                    throw new IOException("无法创建缓存目录");
                }
                target = new File(directory, fileName);
                File partial = new File(directory, fileName + ".part");
                String digest = downloadTo(url, partial);
                if (expected != null && !expected.isEmpty() && !expected.equalsIgnoreCase(digest)) {
                    // A mirror or a captive portal may have served something else.
                    partial.delete();
                    throw new IOException("SHA-256 校验失败，已丢弃下载");
                }
                if (target.exists()) target.delete();
                if (!partial.renameTo(target)) throw new IOException("无法保存安装包");
                JSObject result = new JSObject();
                result.put("path", target.getAbsolutePath());
                result.put("size", target.length());
                call.resolve(result);
            } catch (Exception error) {
                if (target != null) target.delete();
                call.reject(describe(error));
            }
        });
    }

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("缺少安装包路径");
            return;
        }
        try {
            File apk = new File(path);
            if (!apk.exists()) throw new IOException("安装包不存在，请重新下载");
            if (!canInstallPackages()) throw new IOException("尚未允许安装未知应用");
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject(describe(error));
        }
    }

    private boolean canInstallPackages() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    /** Streams `url` into `partial`, emitting progress, and returns its SHA-256. */
    private String downloadTo(String url, File partial) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(20_000);
            connection.setReadTimeout(60_000);
            connection.setRequestProperty("User-Agent", "LiteTavern-Updater");
            connection.setRequestProperty("Accept", "application/octet-stream");
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) throw new IOException("HTTP " + status);

            long total = connection.getContentLengthLong();
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[BUFFER_SIZE];
            long received = 0;
            long lastReport = 0;
            try (
                InputStream input = connection.getInputStream();
                FileOutputStream output = new FileOutputStream(partial)
            ) {
                int read;
                while ((read = input.read(buffer)) > 0) {
                    output.write(buffer, 0, read);
                    digest.update(buffer, 0, read);
                    received += read;
                    if (received - lastReport >= PROGRESS_STEP) {
                        lastReport = received;
                        emitProgress(received, total);
                    }
                }
            }
            emitProgress(received, total > 0 ? total : received);
            return toHex(digest.digest());
        } finally {
            connection.disconnect();
        }
    }

    private void emitProgress(long received, long total) {
        JSObject progress = new JSObject();
        progress.put("received", received);
        progress.put("total", total);
        notifyListeners("progress", progress);
    }

    /** Keeps the download inside the cache directory even if a manifest is malicious. */
    private static String sanitize(String name) {
        String cleaned = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (cleaned.isEmpty() || cleaned.equals(".") || cleaned.equals("..")) return "update.apk";
        return cleaned;
    }

    private static String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }

    private static String describe(Exception error) {
        String message = error.getMessage();
        return message == null || message.isEmpty() ? error.getClass().getSimpleName() : message;
    }
}
