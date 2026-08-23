package ae.bingroups.superapp;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.appcheck.FirebaseAppCheck;

@CapacitorPlugin(name = "FirebaseAppCheckBridge")
public class FirebaseAppCheckBridgePlugin extends Plugin {

    private String diagnosticCode(Throwable error) {
        StringBuilder code = new StringBuilder();
        Throwable cursor = error;
        int depth = 0;

        // Exception class names are safe diagnostic metadata. Include a short
        // cause chain so a wrapped Play Integrity failure is not reduced to a
        // generic FirebaseException, while never exposing messages or tokens.
        while (cursor != null && depth < 3) {
            String simpleName = cursor.getClass().getSimpleName();
            if (simpleName != null && !simpleName.isBlank()) {
                String safeName = simpleName.replaceAll("[^A-Za-z0-9_]", "");
                if (!safeName.isBlank()) {
                    if (code.length() > 0) code.append("__");
                    code.append(safeName);
                }
            }
            Throwable next = cursor.getCause();
            if (next == cursor) break;
            cursor = next;
            depth += 1;
        }

        return code.length() > 0 ? code.toString() : "APP_CHECK_TOKEN_FAILURE";
    }

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
                    call.reject("Firebase App Check returned an invalid token result.", "APP_CHECK_INVALID_TOKEN_RESULT");
                    return;
                }

                JSObject result = new JSObject();
                result.put("token", token);
                result.put("expireTimeMillis", expireTimeMillis);
                call.resolve(result);
            })
            .addOnFailureListener(error -> {
                String code = diagnosticCode(error);
                call.reject("Unable to obtain Firebase App Check token.", code, error);
            });
    }
}
