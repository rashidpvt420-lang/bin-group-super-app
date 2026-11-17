import DeviceCheck
import FirebaseAppCheck
import FirebaseCore

/// Production App Check factory for the Capacitor iOS app.
///
/// App Attest is required on supported hardware (iOS 14+). DeviceCheck is used
/// only when App Attest is unavailable, which is the documented Firebase
/// fallback for older devices, not a debug or unsigned bypass. Debug providers
/// and debug tokens are never installed.
final class BinGroupAppCheckProviderFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
        if #available(iOS 14.0, *), DCAppAttestService.shared.isSupported {
            return AppAttestProvider(app: app)
        }
        return DeviceCheckProvider(app: app)
    }
}
