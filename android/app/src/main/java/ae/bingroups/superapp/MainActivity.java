package ae.bingroups.superapp;

import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;
import com.google.firebase.appcheck.FirebaseAppCheck;
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory;

public class MainActivity extends BridgeActivity {
    private static final String APP_CHECK_LOG_TAG = "BIN_APPCHECK";

    @Override
    public void onCreate(Bundle savedInstanceState) {
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

        super.onCreate(savedInstanceState);
        registerPlugin(FirebaseAppCheckBridgePlugin.class);
    }
}
