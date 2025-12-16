import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'mobile',
  webDir: 'dist',
  server: {
    "androidScheme": "http",
    "allowNavigation": ["*"],
    "cleartext": true
  }
};

export default config;
