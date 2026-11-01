# R8 keep rules for the BIN GROUP release build (minifyEnabled + shrinkResources).
# Capacitor core, Capacitor plugins, AndroidX and Firebase ship their own consumer rules;
# the rules below are belt-and-braces for code reached by reflection or from JavaScript.

# Keep line numbers for readable Play crash stack traces (mapping.txt de-obfuscates them).
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod
-renamesourcefileattribute SourceFile

# Capacitor bridge: plugins are discovered by annotation/reflection and called from the WebView.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
}

# Official Capacitor plugins and this app's own native bridge (FirebaseAppCheckBridgePlugin).
-keep class com.capacitorjs.plugins.** { *; }
-keep class ae.bingroups.superapp.** { *; }

# Cordova compatibility layer.
-keep class org.apache.cordova.** { *; }
-keep public class * extends org.apache.cordova.CordovaPlugin { *; }

# Any WebView JavaScript interface methods.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Firebase App Check / Play Integrity and Firebase components (registered via reflection).
-keep class com.google.firebase.appcheck.** { *; }
-keep class com.google.android.play.core.integrity.** { *; }
-keep class * implements com.google.firebase.components.ComponentRegistrar { *; }
-dontwarn com.google.firebase.**
