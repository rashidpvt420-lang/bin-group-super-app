import Foundation
import Capacitor
import FirebaseAppCheck

@objc(FirebaseAppCheckBridgePlugin)
public class FirebaseAppCheckBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FirebaseAppCheckBridgePlugin"
    public let jsName = "FirebaseAppCheckBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAppCheckToken", returnType: CAPPluginReturnPromise)
    ]

    @objc public func getAppCheckToken(_ call: CAPPluginCall) {
        let forceRefresh = call.getBool("forceRefresh") ?? false

        Task {
            do {
                let result = try await AppCheck.appCheck().token(forcingRefresh: forceRefresh)
                let token = result.token.trimmingCharacters(in: .whitespacesAndNewlines)
                let expireTimeMillis = Int64(result.expirationDate.timeIntervalSince1970 * 1000)
                guard !token.isEmpty, expireTimeMillis > 0 else {
                    call.reject("Firebase App Check returned an invalid token result.", "APP_CHECK_INVALID_TOKEN_RESULT")
                    return
                }
                call.resolve([
                    "token": token,
                    "expireTimeMillis": expireTimeMillis
                ])
            } catch {
                call.reject("Unable to obtain Firebase App Check token.", "APP_CHECK_TOKEN_FAILURE", error)
            }
        }
    }
}
