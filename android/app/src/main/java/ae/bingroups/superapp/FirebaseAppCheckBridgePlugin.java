package ae.bingroups.superapp;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.appcheck.FirebaseAppCheck;

import java.security.MessageDigest;
import java.util.Locale;

@CapacitorPlugin(name = "FirebaseAppCheckBridge")
public class FirebaseAppCheckBridgePlugin extends Plugin {
    // SHA-256 of the certificate actually observed on the Google-Play-installed
    // production package. This must match the Play delivery signer, not the
    // upload key or a different/rotated signing identity shown in Play Console.
    private static final String EXPECTED_PLAY_SIGNING_SHA256 =
        "5B907128BD19514E4D3F804B1E4583D15F0B65F51D61746F6804DAE1B2DCD26C";

    private String sha256(Signature signature) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] value = digest.digest(signature.toByteArray());
            StringBuilder hex = new StringBuilder(value.length * 2);
            for (byte b : value) hex.append(String.format(Locale.US, "%02X", b));
            return hex.toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    private Signature[] currentSigners(SigningInfo signingInfo) {
        if (signingInfo == null) return new Signature[0];
        Signature[] signers = signingInfo.getApkContentsSigners();
        return signers == null ? new Signature[0] : signers;
    }

    private Signature[] signingHistory(SigningInfo signingInfo) {
        if (signingInfo == null) return new Signature[0];
        Signature[] history = signingInfo.getSigningCertificateHistory();
        return history == null ? new Signature[0] : history;
    }

    @SuppressWarnings("deprecation")
    private String signingState() {
        try {
            PackageManager pm = getContext().getPackageManager();
            PackageInfo info;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                info = pm.getPackageInfo(getContext().getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
                SigningInfo signingInfo = info.signingInfo;
                String currentPrefix = "UNKNOWN";
                for (Signature signature : currentSigners(signingInfo)) {
                    String fingerprint = sha256(signature);
                    if (!fingerprint.isBlank()) currentPrefix = fingerprint.substring(0, Math.min(12, fingerprint.length()));
                    if (EXPECTED_PLAY_SIGNING_SHA256.equals(fingerprint)) return "S_OK";
                }
                for (Signature signature : signingHistory(signingInfo)) {
                    String fingerprint = sha256(signature);
                    if (EXPECTED_PLAY_SIGNING_SHA256.equals(fingerprint)) return "S_HISTORY_" + currentPrefix;
                }
                return "S_MISMATCH_" + currentPrefix;
            }

            info = pm.getPackageInfo(getContext().getPackageName(), PackageManager.GET_SIGNATURES);
            Signature[] signatures = info.signatures == null ? new Signature[0] : info.signatures;
            String prefix = "UNKNOWN";
            for (Signature signature : signatures) {
                String fingerprint = sha256(signature);
                if (!fingerprint.isBlank()) prefix = fingerprint.substring(0, Math.min(12, fingerprint.length()));
                if (EXPECTED_PLAY_SIGNING_SHA256.equals(fingerprint)) return "S_OK";
            }
            return "S_MISMATCH_" + prefix;
        } catch (Exception ignored) {
            return "S_UNKNOWN";
        }
    }

    @SuppressWarnings("deprecation")
    private String installerState() {
        try {
            String installer;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                installer = getContext().getPackageManager()
                    .getInstallSourceInfo(getContext().getPackageName())
                    .getInstallingPackageName();
            } else {
                installer = getContext().getPackageManager().getInstallerPackageName(getContext().getPackageName());
            }
            return "com.android.vending".equals(installer) ? "I_OK" : "I_OTHER";
        } catch (Exception ignored) {
            return "I_UNKNOWN";
        }
    }

    @SuppressWarnings("deprecation")
    private String versionState() {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
            return "V" + versionCode;
        } catch (Exception ignored) {
            return "V_UNKNOWN";
        }
    }

    private String classifyMessage(Throwable error) {
        Throwable cursor = error;
        int depth = 0;
        while (cursor != null && depth < 4) {
            String message = String.valueOf(cursor.getMessage()).toLowerCase(Locale.US);
            if (message.contains("app attestation failed") && message.contains("403")) return "ATTEST403";
            if (message.contains("integrityserviceexception: -1") || message.contains("integrity api is not available")) return "PI_-1_UNAVAILABLE";
            if (message.contains("integrityserviceexception: -2") || message.contains("play store app is either not installed or not the official version")) return "PI_-2_PLAYSTORE";
            if (message.contains("integrityserviceexception: -3") || message.contains("network error")) return "PI_-3_NETWORK";
            if (message.contains("integrityserviceexception: -8") || message.contains("too many requests")) return "PI_-8_THROTTLED";
            if (message.contains("integrityserviceexception: -9") || message.contains("binding to the service")) return "PI_-9_BIND";
            if (message.contains("integrityserviceexception: -12") || message.contains("unknown internal google server error")) return "PI_-12_SERVER";
            if (message.contains("unknownhostexception") || message.contains("unable to resolve host")) return "DNS_FAILURE";
            if (message.contains("binder has died")) return "BINDER_DIED";
            Throwable next = cursor.getCause();
            if (next == cursor) break;
            cursor = next;
            depth += 1;
        }
        return "";
    }

    private String classCode(Throwable error) {
        Throwable cursor = error;
        int depth = 0;
        StringBuilder code = new StringBuilder();
        while (cursor != null && depth < 2) {
            String simpleName = cursor.getClass().getSimpleName();
            if (simpleName != null && !simpleName.isBlank()) {
                String safeName = simpleName.replaceAll("[^A-Za-z0-9_]", "");
                if (!safeName.isBlank()) {
                    if (code.length() > 0) code.append("_");
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

    private String diagnosticCode(Throwable error) {
        String root = classifyMessage(error);
        if (root.isBlank()) root = classCode(error);
        return root + "__" + installerState() + "__" + signingState() + "__" + versionState();
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
