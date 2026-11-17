import Capacitor
import FirebaseAppCheck
import FirebaseCore
import Foundation

@objc(FirebaseAppCheckBridgePlugin)
public class FirebaseAppCheckBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FirebaseAppCheckBridgePlugin"
    public let jsName = "FirebaseAppCheckBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAppCheckToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getInstallationBindingProof", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLocationIntegrityProof", returnType: CAPPluginReturnPromise),
    ]

    @objc func getAppCheckToken(_ call: CAPPluginCall) {
        let forceRefresh = call.getBool("forceRefresh") ?? false

        guard FirebaseApp.app() != nil else {
            call.reject(
                "Firebase iOS configuration is unavailable; App Check cannot initialize.",
                "FIREBASE_IOS_CONFIG_MISSING"
            )
            return
        }

        AppCheck.appCheck().token(forcingRefresh: forceRefresh) { token, error in
            if let error = error {
                call.reject(
                    "Unable to obtain Firebase App Check token.",
                    Self.diagnosticCode(error),
                    error
                )
                return
            }

            guard let token else {
                call.reject(
                    "Firebase App Check returned an invalid token result.",
                    "APP_CHECK_INVALID_TOKEN_RESULT"
                )
                return
            }

            let rawToken = token.token.trimmingCharacters(in: .whitespacesAndNewlines)
            let expireTimeMillis = token.expirationDate.timeIntervalSince1970 * 1000
            guard !rawToken.isEmpty, expireTimeMillis > 0 else {
                call.reject(
                    "Firebase App Check returned an invalid token result.",
                    "APP_CHECK_INVALID_TOKEN_RESULT"
                )
                return
            }

            call.resolve([
                "token": rawToken,
                "expireTimeMillis": expireTimeMillis,
            ])
        }
    }

    @objc func getLocationIntegrityProof(_ call: CAPPluginCall) {
        call.reject(
            "Native GPS integrity binding is not available on iOS.",
            "IOS_LOCATION_INTEGRITY_NOT_SUPPORTED"
        )
    }

    @objc func getInstallationBindingProof(_ call: CAPPluginCall) {
        call.reject(
            "Play-signed installation binding is not available on iOS.",
            "IOS_INSTALLATION_BINDING_NOT_SUPPORTED"
        )
    }

    private static func diagnosticCode(_ error: Error) -> String {
        let nsError = error as NSError
        let domain = nsError.domain.replacingOccurrences(
            of: "[^A-Za-z0-9_]",
            with: "",
            options: .regularExpression
        )
        let safeDomain = domain.isEmpty ? "AppCheck" : domain
        return "APP_CHECK_TOKEN_FAILURE__\(safeDomain)__\(nsError.code)"
    }
}
