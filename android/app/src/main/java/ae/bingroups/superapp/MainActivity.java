package ae.bingroups.superapp;

import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;

import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;
import com.google.firebase.appcheck.FirebaseAppCheck;
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory;

public class MainActivity extends BridgeActivity {
    private static final String APP_CHECK_LOG_TAG = "BIN_APPCHECK";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the custom bridge before BridgeActivity creates the Capacitor bridge.
        registerPlugin(FirebaseAppCheckBridgePlugin.class);

        // Install Play Integrity App Check before the WebView can request Firebase tokens.
        FirebaseApp firebaseApp = FirebaseApp.initializeApp(this);
        if (firebaseApp == null) {
            Log.e(APP_CHECK_LOG_TAG, "Firebase Android configuration is unavailable; App Check cannot initialize.");
        } else {
            try {
                FirebaseAppCheck.getInstance(firebaseApp).installAppCheckProviderFactory(
                    PlayIntegrityAppCheckProviderFactory.getInstance()
                );
            } catch (RuntimeException error) {
                Log.e(APP_CHECK_LOG_TAG, "Play Integrity App Check initialization failed.", error);
            }
        }

        // Edge-to-edge on every API level (required behaviour on Android 15 / SDK 35+).
        // Transparent bars with dark icons over the white app background; Capacitor's
        // adjustMarginsForEdgeToEdge=force keeps the WebView inside the system-bar insets.
        EdgeToEdge.enable(
            this,
            SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        );

        super.onCreate(savedInstanceState);
    }
}
