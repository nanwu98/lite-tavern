import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lite.tavern',
  appName: '轻语酒馆',
  webDir: 'dist',
  backgroundColor: '#141210',
  android: {
    backgroundColor: '#141210',
    allowMixedContent: true,
    // Keep Capacitor's input capture off. With it on, the WebView is handed a
    // bare BaseInputConnection instead of its own one, which swallows IME
    // composition (letters only appear once a word is chosen), the keyboard's
    // long-press "clear the field" gesture, and pastes from the keyboard's
    // clipboard. Every text box in this app is typed into through an IME on a
    // phone, so the native input connection is the only correct setting.
    captureInput: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
