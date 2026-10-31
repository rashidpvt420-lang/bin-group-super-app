import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ae.bingroups.superapp',
  appName: 'BIN GROUP',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    // Android 15+ draws edge-to-edge. MainActivity enables it on every API level and Capacitor
    // keeps the WebView inside the system bars, so no content sits under the status or nav bar.
    adjustMarginsForEdgeToEdge: 'force',
    // @capacitor/status-bar is iOS-only here: on Android it calls the deprecated
    // Window.setStatusBarColor API (Play pre-launch warning), and the app never imports it.
    includePlugins: [
      '@capacitor/app',
      '@capacitor/camera',
      '@capacitor/filesystem',
      '@capacitor/geolocation',
      '@capacitor/push-notifications',
      '@capacitor/splash-screen',
    ],
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#FFFFFF',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#C9A646'
    },
    StatusBar: {
      // iOS only (excluded from Android via android.includePlugins).
      style: 'LIGHT',
      overlaysWebView: false
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
