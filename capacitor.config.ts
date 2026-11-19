import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lite.tavern',
  appName: '轻语酒馆',
  webDir: 'dist',
  backgroundColor: '#141210',
  android: {
    backgroundColor: '#141210',
    allowMixedContent: true,
    captureInput: true,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
