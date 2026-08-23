package ae.bingroups.superapp;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.appcheck.FirebaseAppCheck;

@CapacitorPlugin(name = "FirebaseAppCheckBridge")
public class FirebaseAppCheckBridgePlugin extends Plugin {

    @PluginMethod
    public void getAppCheckToken(PluginCall call) {
        Boolean requestedForceRefresh = call.getBoolean("forceRefresh", false);
        boolean forceRefresh = requestedForceRefresh != null && requestedForceRefresh;

        FirebaseAppCheck.getInstance()
            .getAppCheckToken(forceRefresh)
            .addOnSuccessListener(tokenResult -> {
                String token = tokenResult.getToken();
                long expireTimeMillis = tokenResult.getExpireTimeMillis();
                if (token == null || token.isBlank() || expireTimeMillis <= 0L) {
                    call.reject("Firebase App Check returned an invalid token result.");
                    return;
                }

                JSObject result = new JSObject();
                result.put("token", token);
                result.put("expireTimeMillis", expireTimeMillis);
                call.resolve(result);
            })
            .addOnFailureListener(error ->
                call.reject("Unable to obtain Firebase App Check token.", error)
            );
    }
}
